import { i18n } from '../../i18n';
import { listMusicServices } from './smapi/musicServiceRegistry';

/**
 * Service names by id (ListAvailableServices `Id`, the `sid=` in a track URI),
 * for when the speaker's own list can't be read.
 */
const KNOWN_SERVICE_NAMES: Record<string, string> = {
  '2': 'Deezer',
  '9': 'Spotify',
  '12': 'Spotify',
  '31': 'Qobuz',
  '160': 'SoundCloud',
  '174': 'TIDAL',
  '201': 'Amazon Music',
  '204': 'Apple Music',
  '254': 'TuneIn',
  '284': 'YouTube Music',
  '303': 'Sonos Radio',
  '325': 'BBC Sounds',
  '333': 'TuneIn',
};

const serviceNamesBySpeaker = new Map<string, Promise<Map<string, string>>>();

/** The speaker's service id → name list, read once per speaker (and again after a failed read). */
function loadServiceNames(speakerIp: string): Promise<Map<string, string>> {
  let pending = serviceNamesBySpeaker.get(speakerIp);
  if (!pending) {
    pending = listMusicServices(speakerIp).then((services) => {
      if (services.length === 0) serviceNamesBySpeaker.delete(speakerIp);
      return new Map(services.map((service) => [service.serviceId, service.name]));
    });
    pending.catch(() => serviceNamesBySpeaker.delete(speakerIp));
    serviceNamesBySpeaker.set(speakerIp, pending);
  }
  return pending;
}

/**
 * Where the playing track comes from — "TIDAL", "AirPlay", "Line-In" — from
 * its transport URI, or null when the URI names no source (e.g. a bare web
 * stream). TV input isn't covered: Now Playing gives it a screen of its own.
 * URI patterns follow SoCo's `music_source_from_uri`.
 */
export async function describePlaybackSource(speakerIp: string, trackUri: string): Promise<string | null> {
  if (!trackUri) return null;
  if (/^x-sonos-vli:.*,airplay:/.test(trackUri)) return 'AirPlay';
  if (/^x-sonos-vli:.*,spotify:/.test(trackUri)) return 'Spotify Connect';
  if (trackUri.startsWith('x-rincon-stream:')) return i18n.t('nowPlaying.source.lineIn');
  if (trackUri.startsWith('x-file-cifs:')) return i18n.t('nowPlaying.source.library');

  const serviceId = /[?&]sid=(\d+)/.exec(trackUri)?.[1];
  if (!serviceId) return null;
  const names = await loadServiceNames(speakerIp).catch(() => null);
  return names?.get(serviceId) || KNOWN_SERVICE_NAMES[serviceId] || null;
}
