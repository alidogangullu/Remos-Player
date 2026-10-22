import { SonosDevice } from '../../types/sonos';
import { i18n } from '../../i18n';

/** "Sonos Beam + Surrounds + Sub" — the main player plus the speakers bonded to it. */
export function describeRoomHardware(room: SonosDevice): string {
  // Model names ("Sonos Beam") are product names and stay as reported.
  const parts = [room.modelName || i18n.t('common.speaker')];
  if (room.hasSurrounds) parts.push(i18n.t('system.hardware.surrounds'));
  if (room.hasSub) parts.push(i18n.t('system.hardware.sub'));
  return parts.join(' + ');
}
