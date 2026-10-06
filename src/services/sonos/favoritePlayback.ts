import { SonosUpnpClient } from './upnp/sonosUpnpClient';
import { SmapiContext } from './smapi/smapiClient';
import { enrichFavoriteTrackMetadata } from './favoriteTrackMetadata';

/**
 * Sonos "shortcut" favorites (e.g. Sonos Radio's "Trending Now") have no
 * playable URI: in the Sonos app they open a section of the service to browse.
 */
export function isShortcutFavorite(favorite: PlayableFavorite): boolean {
  return !favorite.uri;
}

export interface PlayableFavorite {
  uri?: string;
  metadata?: string;
  albumArtUri?: string;
}

/**
 * Starts a Sonos favorite (or a history entry built like one).
 *
 * - Containers (`x-rincon-cpcontainer:` — albums, playlists) can't be set as
 *   the transport URI; the speaker rejects them. They go through the queue
 *   exactly like a browsed playlist's "Play": inserted after the current
 *   track, then jumped to.
 * - Everything else (tracks, radio streams) is set directly, with a track
 *   favorite's bare DIDL filled in first so Now Playing has artist and art.
 */
export async function playFavorite(
  speakerIp: string,
  speakerId: string,
  favorite: PlayableFavorite,
  fallbackMetadata: string,
  contexts?: SmapiContext[],
): Promise<void> {
  const { uri } = favorite;
  if (!uri) throw new Error('Favorite has no playable URI (a browse shortcut)');

  if (uri.startsWith('x-rincon-cpcontainer:')) {
    const desired = await SonosUpnpClient.getPositionInfo(speakerIp)
      .then((pos) => pos.track + 1)
      .catch(() => 0);
    const { firstTrackNumberEnqueued } = await SonosUpnpClient.addURIToQueue(
      speakerIp,
      uri,
      favorite.metadata || fallbackMetadata,
      desired,
      true,
    );
    // seekTrack switches the transport to the queue and starts playback.
    await SonosUpnpClient.seekTrack(speakerIp, Math.max(firstTrackNumberEnqueued, 1), speakerId);
    return;
  }

  const metadata = await enrichFavoriteTrackMetadata(speakerIp, favorite, contexts);
  await SonosUpnpClient.setAVTransportURI(speakerIp, uri, metadata || fallbackMetadata);
  await SonosUpnpClient.play(speakerIp);
}
