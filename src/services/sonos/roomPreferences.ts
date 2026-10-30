import AsyncStorage from '@react-native-async-storage/async-storage';
import { SonosDevice } from '../../types/sonos';

const ROOM_PREFERENCES_KEY = 'SONOS_TV_ROOM_PREFERENCES';

/** Rooms are kept by their RINCON id, so renaming one in the Sonos app keeps its settings. */
export interface RoomPreferences {
  /** The room last picked in System; the app opens on it. */
  lastRoomId: string | null;
  /** Rooms left out of the list and never picked at launch. */
  hiddenRoomIds: string[];
}

export const EMPTY_ROOM_PREFERENCES: RoomPreferences = { lastRoomId: null, hiddenRoomIds: [] };

/** Every room in a listed group, coordinator first; a room on its own is just itself. */
export function roomIdsOf(device: SonosDevice): string[] {
  return device.memberIds && device.memberIds.length > 0 ? device.memberIds : [device.id];
}

/** A group stays visible while any of its rooms is. */
export function isRoomHidden(device: SonosDevice, hiddenRoomIds: readonly string[]): boolean {
  return roomIdsOf(device).every((id) => hiddenRoomIds.includes(id));
}

/**
 * Splits the list into shown and hidden rooms. With every room hidden, all of
 * them are shown: an empty list would leave nothing to play on.
 */
export function partitionRooms(
  devices: SonosDevice[],
  hiddenRoomIds: readonly string[],
): { visible: SonosDevice[]; hidden: SonosDevice[] } {
  const visible = devices.filter((d) => !isRoomHidden(d, hiddenRoomIds));
  if (visible.length === 0) return { visible: devices, hidden: [] };
  return { visible, hidden: devices.filter((d) => isRoomHidden(d, hiddenRoomIds)) };
}

/**
 * The room to use after a scan: the one already in use if it's still there,
 * else the last one picked (unless hidden since), else the first visible one.
 * A room is "there" when it's in any listed group, so a room that has been
 * grouped since is found through its group.
 */
export function pickRoom(
  devices: SonosDevice[],
  prefs: RoomPreferences,
  currentRoomId?: string | null,
): SonosDevice | null {
  if (devices.length === 0) return null;
  const groupOf = (roomId: string) => devices.find((d) => roomIdsOf(d).includes(roomId));

  const current = currentRoomId ? groupOf(currentRoomId) : undefined;
  if (current) return current;

  const last = prefs.lastRoomId ? groupOf(prefs.lastRoomId) : undefined;
  if (last && !isRoomHidden(last, prefs.hiddenRoomIds)) return last;

  return partitionRooms(devices, prefs.hiddenRoomIds).visible[0];
}

/** Hides every room of `device`, or shows them all again if it's hidden. */
export function toggleRoomHidden(device: SonosDevice, hiddenRoomIds: readonly string[]): string[] {
  const ids = roomIdsOf(device);
  return isRoomHidden(device, hiddenRoomIds)
    ? hiddenRoomIds.filter((id) => !ids.includes(id))
    : [...new Set([...hiddenRoomIds, ...ids])];
}

/** Mirrors the other stores: one AsyncStorage key, JSON, degrades silently. */
export class RoomPreferencesStore {
  static async load(): Promise<RoomPreferences> {
    try {
      const data = await AsyncStorage.getItem(ROOM_PREFERENCES_KEY);
      if (!data) return EMPTY_ROOM_PREFERENCES;
      const parsed = JSON.parse(data);
      return {
        lastRoomId: typeof parsed?.lastRoomId === 'string' ? parsed.lastRoomId : null,
        hiddenRoomIds: Array.isArray(parsed?.hiddenRoomIds)
          ? parsed.hiddenRoomIds.filter((id: unknown): id is string => typeof id === 'string')
          : [],
      };
    } catch {
      return EMPTY_ROOM_PREFERENCES;
    }
  }

  static async save(prefs: RoomPreferences): Promise<void> {
    try {
      await AsyncStorage.setItem(ROOM_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch {
      // Non-blocking storage error
    }
  }
}
