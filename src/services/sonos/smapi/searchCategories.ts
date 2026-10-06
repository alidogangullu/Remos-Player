import { getMetadata, SmapiContext } from './smapiClient';
import { resolveSearchCategoriesFromManifest } from './presentationMap';
import { log } from '../../../utils/logger';
import { SearchCategory } from './smapiTypes';

const TAG = 'SearchCategories';

/**
 * Search category ids are NOT portable across services — "tracks" works on
 * Spotify, Apple Music needs "song", Deezer "search-track", YouTube Music
 * "SONGS", and TuneIn has no track category at all. This resolves the
 * per-service list of `{ label, mappedId }` once and caches it in memory
 * for the process lifetime (categories don't change without a service
 * update, and re-fetching on every keystroke would be wasteful).
 */
const cache = new Map<string, Promise<SearchCategory[]>>();

export function clearSearchCategoryCache(): void {
  cache.clear();
}

export async function resolveSearchCategories(ctx: SmapiContext): Promise<SearchCategory[]> {
  const cacheKey = ctx.service.serviceId;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = resolveSearchCategoriesUncached(ctx);
  cache.set(cacheKey, promise);

  // Don't poison the cache with a failed lookup — a transient network error
  // shouldn't permanently disable search for a service.
  promise.catch(() => cache.delete(cacheKey));

  return promise;
}

async function resolveSearchCategoriesUncached(ctx: SmapiContext): Promise<SearchCategory[]> {
  const tier1 = await resolveTier1(ctx);
  if (tier1.length > 0) {
    return tier1;
  }

  if (!ctx.service.manifestUri) {
    log.warn(TAG, `No search categories and no manifest for ${ctx.service.name}; search will be unavailable`);
    return [];
  }

  return resolveSearchCategoriesFromManifest(ctx.service.manifestUri);
}

/**
 * Tier 1: `getMetadata(id="search")` — most services expose their search
 * categories directly as the `"search"` container's children. Ported from
 * `c.p()` / `ServiceXmlInterface.d()`: `mediaCollection.id` IS the wire
 * `mappedId` here (not a display id needing a second mapping step), and
 * when multiple categories share a display title, ambiguous ones are
 * prefixed with "Library "/"Catalog " based on whether their id contains
 * that substring.
 */
async function resolveTier1(ctx: SmapiContext): Promise<SearchCategory[]> {
  try {
    const result = await getMetadata(ctx, 'search', 0, 100);
    if (result.mediaCollection.length === 0) {
      return [];
    }

    const titleCounts = new Map<string, number>();
    for (const item of result.mediaCollection) {
      titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1);
    }
    const hasAmbiguousTitles = titleCounts.size !== result.mediaCollection.length;

    return result.mediaCollection.map((item) => {
      let label = item.title;
      if (hasAmbiguousTitles) {
        const idLower = item.id.toLowerCase();
        if (idLower.includes('library')) label = `Library ${label}`;
        else if (idLower.includes('catalog')) label = `Catalog ${label}`;
      }
      return { label, mappedId: item.id };
    });
  } catch (error) {
    log.warn(TAG, `Tier-1 search category resolution failed for ${ctx.service.name}`, error as any);
    return [];
  }
}
