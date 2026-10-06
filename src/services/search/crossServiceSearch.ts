import { search, SmapiContext } from '../sonos/smapi/smapiClient';
import { resolveSearchCategories } from '../sonos/smapi/searchCategories';
import { log } from '../../utils/logger';
import { MediaCollection, MediaMetadata, SearchCategory } from '../sonos/smapi/smapiTypes';

const TAG = 'CrossServiceSearch';

export interface SearchResultItem {
  id: string;
  serviceId: string;
  serviceName: string;
  title: string;
  subtitle?: string;
  albumArtUri?: string;
  kind: 'track' | 'collection';
  /** Original item, needed to resolve a playable URI via `getMediaURI`. */
  raw: MediaMetadata | MediaCollection;
}

export interface ServiceSearchResult {
  service: SmapiContext['service'];
  status: 'success' | 'error';
  category?: SearchCategory;
  items: SearchResultItem[];
  /** Present when `status === 'error'` — used for the per-section retry row. */
  errorMessage?: string;
}

/**
 * Fans a query out to every given service **in parallel** and invokes
 * `onResult` as each one resolves, so a slow or failing service never
 * blocks the others from rendering (this is the one place we deliberately
 * improve on the house pattern in `FavoritesScreen`/`HomeScreen`, where
 * every `catch {}` collapses into a shared empty state).
 *
 * Each service searches its own default "all things" category when one
 * exists, otherwise the first resolved category — callers that want a
 * specific category (e.g. the per-service browse panel's filter) should
 * call `search()` directly instead.
 */
export async function crossServiceSearch(
  term: string,
  contexts: SmapiContext[],
  onResult: (result: ServiceSearchResult) => void,
): Promise<void> {
  await Promise.all(contexts.map((ctx) => searchOneService(ctx, term, onResult)));
}

async function searchOneService(
  ctx: SmapiContext,
  term: string,
  onResult: (result: ServiceSearchResult) => void,
): Promise<void> {
  try {
    const categories = await resolveSearchCategories(ctx);
    const category = pickDefaultCategory(categories);
    if (!category) {
      onResult({
        service: ctx.service,
        status: 'error',
        items: [],
        errorMessage: 'No search categories available for this service',
      });
      return;
    }

    const result = await search(ctx, category.mappedId, term);
    const items = toSearchResultItems(ctx, result.mediaCollection, result.mediaMetadata);

    onResult({ service: ctx.service, status: 'success', category, items });
  } catch (error) {
    log.error(TAG, `Search failed for ${ctx.service.name}`, error);
    onResult({
      service: ctx.service,
      status: 'error',
      items: [],
      errorMessage: describeSearchError(error),
    });
  }
}

/** Prefers an "all"-style category; falls back to a track/song category, then the first one. */
function pickDefaultCategory(categories: SearchCategory[]): SearchCategory | null {
  if (categories.length === 0) return null;

  const all = categories.find((c) => c.mappedId.toLowerCase() === 'all' || c.label.toLowerCase() === 'all');
  if (all) return all;

  const trackLike = categories.find((c) => /track|song/i.test(c.label));
  if (trackLike) return trackLike;

  return categories[0];
}

function toSearchResultItems(
  ctx: SmapiContext,
  collections: MediaCollection[],
  metadata: MediaMetadata[],
): SearchResultItem[] {
  const fromCollections: SearchResultItem[] = collections.map((item) => ({
    id: item.id,
    serviceId: ctx.service.serviceId,
    serviceName: ctx.service.name,
    title: item.title,
    subtitle: item.summary,
    albumArtUri: item.albumArtUri,
    kind: 'collection',
    raw: item,
  }));

  const fromMetadata: SearchResultItem[] = metadata.map((item) => ({
    id: item.id,
    serviceId: ctx.service.serviceId,
    serviceName: ctx.service.name,
    title: item.title,
    subtitle: item.artist ?? item.album ?? item.summary,
    albumArtUri: item.albumArtUri,
    kind: 'track',
    raw: item,
  }));

  return [...fromMetadata, ...fromCollections];
}

function describeSearchError(error: unknown): string {
  const anyErr = error as any;
  if (anyErr?.name === 'SmapiFault') return anyErr.message || 'Search failed';
  if (anyErr?.response) return `Search failed (HTTP ${anyErr.response.status})`;
  if (anyErr?.request) return 'No response from service';
  return 'Search failed';
}
