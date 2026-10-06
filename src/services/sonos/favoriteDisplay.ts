import { buildSmapiContexts } from './smapi/smapiContextBuilder';
import { getMetadata, SmapiContext } from './smapi/smapiClient';
import { log } from '../../utils/logger';

const TAG = 'FavoriteDisplay';

export interface DisplayableFavorite {
  id: string;
  /** Kind shown on the card's badge, when the card has one (Favorites tab). */
  type?: string;
  title: string;
  subtitle?: string;
  albumArtUri?: string;
  uri?: string;
  metadata?: string;
}

/** Albums already checked this launch, keyed by URI: the lone track's labels, or null when it isn't a one-track album. */
const singleTrackCache = new Map<string, { title: string; artist?: string; albumArtUri?: string } | null>();

/**
 * The service id and SMAPI container id behind an album favorite: its DIDL
 * item id is an 8-hex-digit type code plus the URL-encoded SMAPI id
 * (`1004206clibraryalbum%3Al.bAL2H8o` → `libraryalbum:l.bAL2H8o`).
 */
function parseAlbumRef(uri: string, didl: string): { serviceId: string; containerId: string } | null {
  const serviceId = /[?&]sid=(\d+)/.exec(uri)?.[1];
  const encodedId = /<item\s[^>]*\bid="[0-9A-Fa-f]{8}([^"]+)"/.exec(didl)?.[1];
  if (!serviceId || !encodedId) return null;
  try {
    return { serviceId, containerId: decodeURIComponent(encodedId) };
  } catch {
    return null;
  }
}

/**
 * Liking one song in Apple Music adds its album to the library holding only
 * that song, and the Sonos app saves the favorite as that album — so it shows
 * the album's name (sometimes just "?") while only ever playing the one song.
 * This relabels such one-track album favorites as that song: its title, artist,
 * artwork and a "track" type. Playlists are left alone: their name is the user's own.
 * Lookups run once per album per launch; anything unresolved keeps its labels.
 */
export async function labelSingleTrackAlbums<T extends DisplayableFavorite>(
  speakerIp: string,
  favorites: T[],
  contexts?: SmapiContext[],
): Promise<T[]> {
  const albums = favorites.filter(
    (f) => f.uri?.startsWith('x-rincon-cpcontainer:') && f.metadata?.includes('object.container.album'),
  );
  if (albums.length === 0) return favorites;

  let ctxs = contexts && contexts.length > 0 ? contexts : null;
  await Promise.all(
    albums.map(async (fav) => {
      const uri = fav.uri!;
      if (singleTrackCache.has(uri)) return;
      const ref = parseAlbumRef(uri, fav.metadata!);
      if (!ref) return;
      try {
        ctxs ??= await buildSmapiContexts(speakerIp);
        const ctx = ctxs.find((c) => c.service.serviceId === ref.serviceId);
        if (!ctx) return;
        const result = await getMetadata(ctx, ref.containerId, 0, 2);
        const track = result.mediaMetadata[0];
        singleTrackCache.set(
          uri,
          result.total === 1 && result.mediaMetadata.length === 1 && track.title
            ? { title: track.title, artist: track.artist, albumArtUri: track.albumArtUri }
            : null,
        );
      } catch (error) {
        log.warn(TAG, `Couldn't inspect album favorite "${fav.title}"`, String(error));
      }
    }),
  );

  return favorites.map((fav) => {
    const single = fav.uri ? singleTrackCache.get(fav.uri) : undefined;
    if (!single) return fav;
    return {
      ...fav,
      // It plays one song, so it's labeled as one.
      ...(fav.type !== undefined ? {type: 'track'} : {}),
      title: single.title,
      subtitle: single.artist ?? fav.subtitle,
      albumArtUri: fav.albumArtUri || single.albumArtUri,
    } as T;
  });
}
