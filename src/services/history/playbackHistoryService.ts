import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeCarouselItem } from '../../features/home/HomeScreen';
import { isStreamUrlTitle } from '../sonos/upnp/sonosUpnpClient';

const RECENTLY_PLAYED_KEY = 'SONOS_TV_RECENTLY_PLAYED';
const MAX_RECENT_ITEMS = 25;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Minimal DIDL-Lite for history entries saved before metadata was stored, so the speaker still knows the title. */
export function buildBasicDidl(item: { title: string; subtitle?: string; albumArtUri?: string }): string {
  let xml =
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
    'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
    '<item id="-1" parentID="-1" restricted="true">' +
    `<dc:title>${escapeXml(item.title)}</dc:title>`;
  if (item.subtitle) xml += `<dc:creator>${escapeXml(item.subtitle)}</dc:creator>`;
  if (item.albumArtUri) xml += `<upnp:albumArtURI>${escapeXml(item.albumArtUri)}</upnp:albumArtURI>`;
  return `${xml}<upnp:class>object.item.audioItem.musicTrack</upnp:class></item></DIDL-Lite>`;
}

/** Now Playing's placeholder when the speaker reports no title — not a real item. */
const PLACEHOLDER_TITLES = new Set(['audio', 'sonos audio']);

function isPlaceholder(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase()) || isStreamUrlTitle(title);
}

function isTvAudio(item: { title?: string; uri?: string }): boolean {
  if (item.uri?.includes('x-sonos-htastream')) return true;
  const title = item.title?.trim().toLowerCase();
  return title === 'tv' || title === 'tv audio';
}

export class PlaybackHistoryService {
  /**
   * Retrieves the locally recorded playback history items
   */
  static async getRecentlyPlayed(): Promise<HomeCarouselItem[]> {
    try {
      const data = await AsyncStorage.getItem(RECENTLY_PLAYED_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      // Also drops placeholders and raw stream-URL titles ("wnycfm-tunein.aac?source=TuneIn…") older builds saved.
      return Array.isArray(parsed)
        ? parsed.filter((item) => !isTvAudio(item) && !isPlaceholder(String(item.title ?? '')))
        : [];
    } catch {
      return [];
    }
  }

  /**
   * Records a track into the playback history.
   * If already present, moves it to the front.
   */
  static async addTrack(item: {
    title: string;
    artist?: string;
    album?: string;
    albumArtUri?: string;
    uri?: string;
    metadata?: string;
  }): Promise<void> {
    if (
      !item.title ||
      item.title.trim() === '' ||
      isTvAudio(item) ||
      isPlaceholder(item.title)
    ) {
      return;
    }

    try {
      const current = await this.getRecentlyPlayed();
      const cleanTitle = item.title.trim();
      const cleanSubtitle = (item.artist || item.album || 'Sonos').trim();

      const isSame = (existing: HomeCarouselItem) =>
        existing.title.toLowerCase() === cleanTitle.toLowerCase() &&
        existing.subtitle.toLowerCase() === cleanSubtitle.toLowerCase();
      const previous = current.find(isSame);
      const filtered = current.filter((existing) => !isSame(existing));

      const newItem: HomeCarouselItem = {
        id: `recent-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: cleanTitle,
        subtitle: cleanSubtitle,
        albumArtUri: item.albumArtUri || previous?.albumArtUri || '',
        // Now Playing re-records tracks without metadata; keep the uri+metadata pair the original play stored.
        ...(!item.metadata && previous?.metadata
          ? { uri: previous.uri, metadata: previous.metadata }
          : { uri: item.uri || previous?.uri || '', metadata: item.metadata }),
      };

      const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
      await AsyncStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
    } catch {
      // Non-blocking storage error
    }
  }

  /**
   * Seeds initial recently played history if empty (e.g. from user's current Sonos active session)
   */
  static async seedIfEmpty(items: HomeCarouselItem[]): Promise<void> {
    try {
      const current = await this.getRecentlyPlayed();
      const seed = items.filter((item) => !isTvAudio(item));
      if (current.length === 0 && seed.length > 0) {
        await AsyncStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(seed.slice(0, MAX_RECENT_ITEMS)));
      }
    } catch {
      // Non-blocking
    }
  }

  /**
   * Clears the playback history
   */
  static async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(RECENTLY_PLAYED_KEY);
    } catch {
      // Non-blocking
    }
  }
}
