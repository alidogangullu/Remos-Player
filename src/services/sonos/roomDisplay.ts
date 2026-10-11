import { SonosDevice } from '../../types/sonos';

/** "Sonos Beam + Surrounds + Sub" — the main player plus the speakers bonded to it. */
export function describeRoomHardware(room: SonosDevice): string {
  const parts = [room.modelName || 'Sonos Speaker'];
  if (room.hasSurrounds) parts.push('Surrounds');
  if (room.hasSub) parts.push('Sub');
  return parts.join(' + ');
}
