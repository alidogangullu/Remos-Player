export interface SonosDevice {
  id: string; // UDN or RINCON_xxx
  name: string; // e.g. "Living Room"
  ip: string;
  port: number;
  modelName?: string;
  householdId?: string;
  isCoordinator?: boolean;
  groupMembersCount?: number;
  groupName?: string;
  groupedWith?: string[]; // Names of other rooms/zones grouped with this one
  hasSub?: boolean; // True if bonded with Sonos Sub/Sub Mini
  hasSurrounds?: boolean; // True if bonded with rear surround pair
  hasTvInput?: boolean; // True if the player has a TV input (publishes the HTControl service)
}

export interface ZoneGroup {
  id: string;
  coordinatorId: string;
  name: string;
  members: SonosDevice[];
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtUri?: string;
  durationMs: number;
  positionMs: number;
  uri?: string;
}

export type PlaybackState = 'PLAYING' | 'PAUSED_PLAYBACK' | 'STOPPED' | 'TRANSITIONING';
