import axios from 'axios';
import { SONOS_DEFAULTS } from '../../../constants';
import { log } from '../../../utils/logger';
import { accountSuffixedDeviceId } from '../security/thirdPartyAccounts';
import { supportsTimeZoneContext } from './musicServiceRegistry';
import { SmapiContext, CONTROLLER_ID, randomUuid, refreshContextCredentials } from './smapiClient';
import { GetMetadataResult, MediaCollection, MediaMetadata } from './smapiTypes';

const TAG = 'ServiceBrowseApi';
const BROWSE_TIMEOUT_MS = 8000;

/**
 * Per-service JSON "Browse" API base URLs — a second, non-SMAPI endpoint
 * some services (notably Apple Music) use to serve their root panel's
 * personalized shelves (e.g. "For You"). SMAPI's `getMetadata(root)` alone
 * only returns the plain containers (New/Radio/Library); this is what
 * tvonos additionally calls to get the richer root screen. Ported from the
 * hardcoded map in `references/tvonos/src/sonos/smapi/MusicServiceConfig.java`
 * (field `e`) — services not listed here have no browse API, and callers
 * should fall back to plain SMAPI `getMetadata(root)`.
 */
const BROWSE_BASE_URLS: Record<string, string> = {
  '204': 'https://sonos-music.apple.com/browse/v1', // Apple Music
  '2': 'https://platform.deezer.com/api/sonos/browse', // Deezer
  '12': 'https://spotify-v5.ws.sonos.com/v1/browse', // Spotify
  '9': 'https://spotify-v5.ws.sonos.com/v1/browse', // Spotify (alt id)
  '333': 'https://sonos.tunein.com/browse/v1', // TuneIn
  '303': 'https://sali.sonos.superhi.fi/browse/v1', // Sonos Radio
  '295': 'https://sms.soundtrackyourbrand.com/api/sonos/browse/v1',
  '37': 'https://ce-sonos.siriusxm.com/sonos/v1/browse', // SiriusXM
  '325': 'https://smapi.api.bbci.co.uk/browse', // BBC Sounds
  '201': 'https://sonos.smapi.amazonmusic.com/api/home', // Amazon Music
};

export function hasBrowseApi(serviceId: string): boolean {
  return serviceId in BROWSE_BASE_URLS;
}

interface BrowseItemDetails {
  name?: string;
  imageUrl?: string;
  summary?: string;
  type?: string;
  artist?: { name?: string };
}

interface BrowseContent {
  container?: BrowseItemDetails;
  track?: BrowseItemDetails;
}

interface BrowseView {
  id?: { objectId?: string };
  total?: number;
  browsePolicies?: { canEnumerate?: boolean; canPlay?: boolean };
  content?: BrowseContent;
}

interface BrowseRoot {
  total?: number;
  views?: BrowseView[];
}

/** A view's title/artwork/summary come from `track` when present, else `container` (`Content.getTitle()` etc. in the decompiled client). */
function pick(content: BrowseContent | undefined, field: 'name' | 'imageUrl' | 'summary' | 'type'): string | undefined {
  const trackValue = content?.track?.[field];
  if (trackValue) return trackValue;
  return content?.container?.[field];
}

/**
 * Fetches a service's personalized root shelves from its own JSON Browse
 * API (distinct from SMAPI's SOAP `getMetadata`). Returns `null` when the
 * service has no browse API, the request fails, or the response has no
 * usable views — callers should fall back to `getMetadata(ctx, 'root')` in
 * that case, exactly like tvonos does (`c.java#k()`: JSON views are
 * preferred only when present and non-empty; this is root-only, never used
 * for drill-down).
 */
export async function fetchBrowseRoot(ctx: SmapiContext, isRetry: boolean = false): Promise<GetMetadataResult | null> {
  const { service, account, householdId } = ctx;
  const baseUrl = BROWSE_BASE_URLS[service.serviceId];
  if (!baseUrl) return null;

  const deviceId = account ? accountSuffixedDeviceId(householdId, account.udn) : householdId;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': SONOS_DEFAULTS.USER_AGENT,
    'X-Sonos-Corr-Id': randomUuid(),
    'X-Sonos-Controller-ID': CONTROLLER_ID,
    'X-Sonos-Device-Id': deviceId,
    'X-Sonos-Api-Key': SONOS_DEFAULTS.API_KEY,
    'Accept-Language': 'en-US',
  };
  if (supportsTimeZoneContext(service)) {
    headers['X-Sonos-Context-TimeZone'] = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  if (account?.authToken) {
    headers.Authorization = `Bearer ${account.authToken}`;
  }

  try {
    const response = await axios.get<BrowseRoot>(baseUrl, { headers, timeout: BROWSE_TIMEOUT_MS });
    const views = response.data?.views ?? [];
    if (views.length === 0) return null;

    const mediaCollection: MediaCollection[] = [];
    const mediaMetadata: MediaMetadata[] = [];

    for (const view of views) {
      const id = view.id?.objectId;
      const title = pick(view.content, 'name');
      if (!id || !title) continue;

      const isContainer =
        (view.total ?? 0) > 0 ||
        view.browsePolicies?.canEnumerate === true ||
        pick(view.content, 'type')?.toLowerCase() === 'container';

      const summary = pick(view.content, 'summary');
      const albumArtUri = pick(view.content, 'imageUrl');

      if (isContainer) {
        mediaCollection.push({
          id,
          title,
          summary,
          albumArtUri,
          canPlay: view.browsePolicies?.canPlay,
          itemType: pick(view.content, 'type'),
        });
      } else {
        mediaMetadata.push({
          id,
          title,
          summary,
          albumArtUri,
          itemType: pick(view.content, 'type'),
          artist: view.content?.track?.artist?.name ?? view.content?.container?.artist?.name,
        });
      }
    }

    if (mediaCollection.length === 0 && mediaMetadata.length === 0) return null;

    return {
      index: 0,
      count: mediaCollection.length + mediaMetadata.length,
      total: response.data?.total ?? mediaCollection.length + mediaMetadata.length,
      mediaCollection,
      mediaMetadata,
    };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    // A stale token: refresh it and retry once, as tvonos does (`c.java#j()`).
    // The refreshed token also fixes this service's SMAPI calls, which can
    // answer an empty result rather than a fault when the token is stale.
    if (status === 401 && !isRetry && (await refreshContextCredentials(ctx).catch(() => false))) {
      log.debug(TAG, `Browse API 401 for ${service.name}; retrying with a refreshed token`);
      return fetchBrowseRoot(ctx, true);
    }
    // Status and message only: the raw axios error carries the request headers, Bearer token included.
    log.warn(TAG, `Browse API failed for ${service.name} (${baseUrl})`, {
      status,
      message: (error as Error)?.message,
    });
    return null;
  }
}
