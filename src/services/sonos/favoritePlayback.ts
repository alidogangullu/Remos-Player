import { SonosUpnpClient } from './upnp/sonosUpnpClient';
import { getMediaMetadata, SmapiContext } from './smapi/smapiClient';
import { buildSmapiContexts, findServiceContext } from './smapi/smapiContextBuilder';
import { buildContainerPlaybackTarget } from './smapi/containerPlaybackUri';
import { playMediaItem } from './smapi/playMediaItem';
import { serviceIdFromUdn } from './security/thirdPartyAccounts';
import { enrichFavoriteTrackMetadata } from './favoriteTrackMetadata';

export interface PlayableFavorite {
  title?: string;
  uri?: string;
  metadata?: string;
  albumArtUri?: string;
}

interface ShortcutTarget {
  serviceId: string;
  itemId: string;
  kind: 'track' | 'album' | 'playlist';
}

/** DIDL class → what a URI-less favorite points at; anything else (e.g. a station list) only opens a section. */
const SHORTCUT_KINDS: [string, ShortcutTarget['kind']][] = [
  ['object.item.audioItem.musicTrack', 'track'],
  ['object.container.album', 'album'],
  ['object.container.playlistContainer', 'playlist'],
];

/**
 * Favorites saved from the current Sonos app for some services (TIDAL) are
 * stored as `r:type="shortcut"` with an empty `<res>`, yet their DIDL still
 * names the item: an 8-hex-digit type code plus the SMAPI id with "/" written
 * as `__UNENCODED_SLASH__` (`10082064track__UNENCODED_SLASH__264617523` →
 * `track/264617523`), and the account token, whose `SA_RINCON<n>` gives the
 * service id.
 */
function parseShortcutTarget(metadata: string | undefined): ShortcutTarget | null {
  if (!metadata) return null;
  const kind = SHORTCUT_KINDS.find(([upnpClass]) => metadata.includes(`<upnp:class>${upnpClass}`))?.[1];
  const rawId = /<item\s[^>]*\bid="[0-9A-Fa-f]{8}([^"]+)"/.exec(metadata)?.[1];
  const udn = />(SA_RINCON\d+_[^<]*)<\/desc>/.exec(metadata)?.[1];
  const serviceId = udn ? serviceIdFromUdn(udn) : null;
  if (!kind || !rawId || !serviceId) return null;
  try {
    return { serviceId, itemId: decodeURIComponent(rawId.replaceAll('__UNENCODED_SLASH__', '/')), kind };
  } catch {
    return null;
  }
}

/**
 * Sonos "shortcut" favorites (e.g. Sonos Radio's "Trending Now") have no
 * playable URI: in the Sonos app they open a section of the service to browse.
 * URI-less favorites that still name a track, album or playlist aren't
 * shortcuts here — `playFavorite` resolves them through the service.
 */
export function isShortcutFavorite(favorite: PlayableFavorite): boolean {
  return !favorite.uri && !parseShortcutTarget(favorite.metadata);
}

/** Inserted after the current track, then jumped to — the same as a browsed playlist's "Play". */
async function queueContainerAndPlay(speakerIp: string, speakerId: string, uri: string, metadata: string): Promise<void> {
  const desired = await SonosUpnpClient.getPositionInfo(speakerIp)
    .then((pos) => pos.track + 1)
    .catch(() => 0);
  const { firstTrackNumberEnqueued } = await SonosUpnpClient.addURIToQueue(speakerIp, uri, metadata, desired, true);
  // seekTrack switches the transport to the queue and starts playback.
  await SonosUpnpClient.seekTrack(speakerIp, Math.max(firstTrackNumberEnqueued, 1), speakerId);
}

/** Plays what a URI-less favorite names, built the same way as browsing to it in the service. */
async function playShortcutTarget(
  speakerIp: string,
  speakerId: string,
  favorite: PlayableFavorite,
  target: ShortcutTarget,
  contexts?: SmapiContext[],
): Promise<void> {
  const ctxs = contexts && contexts.length > 0 ? contexts : await buildSmapiContexts(speakerIp);
  const ctx = findServiceContext(ctxs, target.serviceId);
  if (!ctx) throw new Error(`Service ${target.serviceId} isn't linked in this app`);

  if (target.kind === 'track') {
    const track = await getMediaMetadata(ctx, target.itemId);
    if (!track) throw new Error(`${ctx.service.name} has no track ${target.itemId}`);
    await playMediaItem(speakerIp, speakerId, ctx, track);
    return;
  }

  const { uri, metadata } = buildContainerPlaybackTarget(ctx, {
    id: target.itemId,
    title: favorite.title ?? '',
    itemType: target.kind,
    albumArtUri: favorite.albumArtUri,
  });
  await queueContainerAndPlay(speakerIp, speakerId, uri, metadata);
}

/**
 * Starts a Sonos favorite (or a history entry built like one).
 *
 * - Containers (`x-rincon-cpcontainer:` — albums, playlists) can't be set as
 *   the transport URI; the speaker rejects them. They go through the queue
 *   exactly like a browsed playlist's "Play": inserted after the current
 *   track, then jumped to.
 * - Favorites with no URI but a named track/album/playlist (see
 *   `parseShortcutTarget`) are looked up on their service and played as if
 *   browsed to.
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
  if (!uri) {
    const target = parseShortcutTarget(favorite.metadata);
    if (!target) throw new Error('Favorite has no playable URI (a browse shortcut)');
    await playShortcutTarget(speakerIp, speakerId, favorite, target, contexts);
    return;
  }

  if (uri.startsWith('x-rincon-cpcontainer:')) {
    await queueContainerAndPlay(speakerIp, speakerId, uri, favorite.metadata || fallbackMetadata);
    return;
  }

  const metadata = await enrichFavoriteTrackMetadata(speakerIp, favorite, contexts);
  await SonosUpnpClient.setAVTransportURI(speakerIp, uri, metadata || fallbackMetadata);
  await SonosUpnpClient.play(speakerIp);
}
