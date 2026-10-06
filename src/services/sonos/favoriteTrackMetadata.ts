import { buildSmapiContexts } from './smapi/smapiContextBuilder';
import { getMediaMetadata, SmapiContext } from './smapi/smapiClient';
import { log } from '../../utils/logger';

const TAG = 'FavoriteTrackMetadata';

/** Past this, play with what the favorite already has rather than keep the user waiting. */
const LOOKUP_TIMEOUT_MS = 2500;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * The service id and SMAPI track id behind a track favorite. Its DIDL item id
 * is an 8-hex-digit type code followed by the URL-encoded SMAPI id
 * (`10032028song%3A1440856647` → `song:1440856647`), and its URI carries the
 * service id as `sid=`.
 */
function parseTrackRef(uri: string, didl: string): { serviceId: string; itemId: string } | null {
  const serviceId = /[?&]sid=(\d+)/.exec(uri)?.[1];
  const encodedId = /<item\s[^>]*\bid="[0-9A-Fa-f]{8}([^"]+)"/.exec(didl)?.[1];
  if (!serviceId || !encodedId) return null;
  try {
    return { serviceId, itemId: decodeURIComponent(encodedId) };
  } catch {
    return null;
  }
}

/**
 * A Sonos favorite's own DIDL (`r:resMD`) holds just a title, class and
 * account token — no artist, album or artwork. Played as-is, the speaker
 * reports exactly that, so Now Playing shows "Unknown Artist" and no cover.
 * For track favorites this looks the track up on its service (SMAPI
 * `getMediaMetadata`) and writes artist, album and artwork into the DIDL,
 * keeping the original id and token so playback is unchanged. Falls back to
 * just the favorite's own artwork when the lookup fails or is slow.
 */
export async function enrichFavoriteTrackMetadata(
  speakerIp: string,
  favorite: { uri?: string; metadata?: string; albumArtUri?: string },
  contexts?: SmapiContext[],
): Promise<string | undefined> {
  const { uri, metadata, albumArtUri } = favorite;
  if (!uri || !metadata || !metadata.includes('object.item.audioItem.musicTrack')) return metadata;
  if (metadata.includes('<dc:creator>')) return metadata; // already complete

  const fields: { creator?: string; album?: string; art?: string } = { art: albumArtUri };
  const ref = parseTrackRef(uri, metadata);
  if (ref) {
    try {
      const lookup = (async () => {
        const ctxs = contexts && contexts.length > 0 ? contexts : await buildSmapiContexts(speakerIp);
        const ctx = ctxs.find((c) => c.service.serviceId === ref.serviceId);
        return ctx ? getMediaMetadata(ctx, ref.itemId) : null;
      })();
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS));
      const track = await Promise.race([lookup, timeout]);
      if (track) {
        fields.creator = track.artist;
        fields.album = track.album;
        fields.art = track.albumArtUri ?? fields.art;
      }
    } catch (error) {
      log.warn(TAG, `Track lookup failed for favorite ${ref.itemId}`, String(error));
    }
  }

  let extra = '';
  if (fields.creator) extra += `<dc:creator>${escapeXml(fields.creator)}</dc:creator>`;
  if (fields.album) extra += `<upnp:album>${escapeXml(fields.album)}</upnp:album>`;
  if (fields.art && !metadata.includes('<upnp:albumArtURI>')) {
    extra += `<upnp:albumArtURI>${escapeXml(fields.art)}</upnp:albumArtURI>`;
  }
  if (!extra) return metadata;
  // Right before the class element, which every Sonos item DIDL carries.
  return metadata.replace('<upnp:class>', `${extra}<upnp:class>`);
}
