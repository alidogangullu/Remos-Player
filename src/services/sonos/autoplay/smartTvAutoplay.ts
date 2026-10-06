import AsyncStorage from '@react-native-async-storage/async-storage';
import { SonosDevice } from '../../../types/sonos';
import { SonosUpnpClient } from '../upnp/sonosUpnpClient';
import { log } from '../../../utils/logger';

/**
 * TV Autoplay modes offered in Settings.
 *
 * - `off` / `on` map directly onto the soundbar's own TV Autoplay setting.
 * - `smart` is ours: TV Autoplay stays on for normal TV watching, but is switched
 *   off while this app is in the foreground. Android TV interface sounds leave the
 *   TV over HDMI-ARC, and with TV Autoplay on the soundbar treats them as "the TV
 *   started" and drops our music for TV audio.
 *
 * Sonos has no notion of `smart`, so the choice is stored locally per soundbar and
 * the device is driven from the app lifecycle (see `useSmartTvAutoplay`). It applies
 * to every smart soundbar whichever speaker the app is controlling, since the TV
 * feeds its soundbar regardless.
 */
export type TvAutoplayMode = 'off' | 'on' | 'smart';

/** The speaker fields autoplay handling needs. */
export type AutoplayTarget = Pick<SonosDevice, 'id' | 'ip'>;

/** Keyed by speaker id: where to put TV Autoplay back once the app leaves. */
type Suspensions = Record<string, { ip: string; roomUuid: string }>;

const TAG = 'SmartTvAutoplay';
// Addresses are stored so launch can act before discovery finishes (~20 s).
const SMART_TARGETS_KEY = 'SONOS_TV_SMART_AUTOPLAY_TARGETS';
// Written before TV Autoplay is switched off and cleared once it is back on, so a
// session killed mid-suspend is repaired on the next background.
const SUSPENSIONS_KEY = 'SONOS_TV_SMART_AUTOPLAY_SUSPENSIONS';

/** TV Autoplay only exists on speakers with a TV input. */
export function hasTvInput(speaker?: SonosDevice | null): boolean {
  return Boolean(speaker?.hasTvInput);
}

// Device writes run one at a time: a quick foreground → background → foreground must
// reach the speaker in that order, or it could end up stuck off.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}

const getTargets = async () => {
  const targets = await readJson<AutoplayTarget[]>(SMART_TARGETS_KEY, []);
  return Array.isArray(targets) ? targets : [];
};
const saveTargets = (targets: AutoplayTarget[]) =>
  AsyncStorage.setItem(SMART_TARGETS_KEY, JSON.stringify(targets));
const getSuspensions = () => readJson<Suspensions>(SUSPENSIONS_KEY, {});
const saveSuspensions = (suspensions: Suspensions) =>
  AsyncStorage.setItem(SUSPENSIONS_KEY, JSON.stringify(suspensions));

async function dropSuspension(id: string): Promise<void> {
  const suspensions = await getSuspensions();
  delete suspensions[id];
  await saveSuspensions(suspensions);
}

async function suspend(target: AutoplayTarget): Promise<void> {
  const suspensions = await getSuspensions();
  // Restore to whatever room the speaker itself points at. If it already reads ''
  // (a previous session died mid-suspend), keep that session's record.
  const current = await SonosUpnpClient.getTVAutoplayRoomUuid(target.ip);
  const roomUuid =
    current ||
    suspensions[target.id]?.roomUuid ||
    target.id ||
    (await SonosUpnpClient.getRoomUuid(target.ip));

  // Persist before touching the device, so a crash right after still gets undone.
  await saveSuspensions({ ...suspensions, [target.id]: { ip: target.ip, roomUuid } });
  await SonosUpnpClient.setTVAutoplay(target.ip, false);
}

async function restore(id: string): Promise<void> {
  const suspension = (await getSuspensions())[id];
  if (!suspension) return;
  await SonosUpnpClient.setTVAutoplay(suspension.ip, true, suspension.roomUuid);
  // Dropped only once the speaker accepted it; a failure retries next time.
  await dropSuspension(id);
}

/** Runs `task` for each item, logging failures so one offline speaker can't block the rest. */
async function forEachSafely<T>(items: T[], label: string, task: (item: T) => Promise<void>) {
  for (const item of items) {
    try {
      await task(item);
    } catch (error) {
      log.warn(TAG, `${label} failed`, error);
    }
  }
}

export const SmartTvAutoplay = {
  /** The mode to show in Settings. Throws if the speaker can't be read. */
  async getMode(target: AutoplayTarget): Promise<TvAutoplayMode> {
    if ((await getTargets()).some((t) => t.id === target.id)) return 'smart';
    return (await SonosUpnpClient.getTVAutoplay(target.ip)) ? 'on' : 'off';
  },

  /**
   * Applies a mode chosen in Settings and returns the mode now in effect.
   * Called while the app is in the foreground, so `smart` suspends right away.
   */
  applyMode(target: AutoplayTarget, mode: TvAutoplayMode): Promise<TvAutoplayMode> {
    return serialize(async () => {
      const others = (await getTargets()).filter((t) => t.id !== target.id);

      if (mode === 'smart') {
        await saveTargets([...others, target]);
        await suspend(target);
        return 'smart';
      }

      await saveTargets(others);
      // An explicit choice replaces whatever a suspend was waiting to put back.
      await dropSuspension(target.id);
      await SonosUpnpClient.setTVAutoplay(target.ip, mode === 'on', target.id);
      // Read back so Settings reflects the speaker, not our request.
      return (await SonosUpnpClient.getTVAutoplay(target.ip)) ? 'on' : 'off';
    });
  },

  /** App is in the foreground: suspend TV Autoplay on every smart soundbar. */
  onForeground(): Promise<void> {
    return serialize(async () =>
      forEachSafely(await getTargets(), 'Suspending TV Autoplay', suspend)
    );
  },

  /** App left the foreground: put back every suspended TV Autoplay. */
  onBackground(): Promise<void> {
    return serialize(async () =>
      forEachSafely(Object.keys(await getSuspensions()), 'Restoring TV Autoplay', restore)
    );
  },

  /**
   * Records a smart soundbar's current address from discovery (DHCP can move it).
   * Resolves true when a stored address changed.
   */
  updateAddress(target: AutoplayTarget): Promise<boolean> {
    return serialize(async () => {
      const targets = await getTargets();
      const stored = targets.find((t) => t.id === target.id);
      if (!stored || stored.ip === target.ip) return false;

      await saveTargets(targets.map((t) => (t.id === target.id ? target : t)));
      const suspensions = await getSuspensions();
      if (suspensions[target.id]) {
        suspensions[target.id] = { ...suspensions[target.id], ip: target.ip };
        await saveSuspensions(suspensions);
      }
      return true;
    });
  },
};
