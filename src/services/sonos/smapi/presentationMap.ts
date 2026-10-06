import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SONOS_DEFAULTS } from '../../../constants';
import { log } from '../../../utils/logger';
import { SearchCategory } from './smapiTypes';

const TAG = 'PresentationMap';
const FETCH_TIMEOUT_MS = 6000;

/**
 * Tier-2 fallback for search category resolution: fetch the service's
 * manifest JSON (`<Manifest Uri>` from `ListAvailableServices`), follow
 * `presentationMap.uri`, and read the `<PresentationMap type="Search">`
 * block out of that XML.
 *
 * Ported from `MusicServiceConfig.f()`. `mappedId` is the wire value sent
 * in `<search><id>`; the display label is the raw `id`, optionally
 * prefixed by the block's `stringId` (minus the word "Search") when a
 * service exposes more than one `<SearchCategories>` block — e.g. Apple
 * Music's "SearchTitle" vs "LibrarySearchTitle" ("Library albums").
 * `<CustomCategory>` elements are read the same way as `<Category>`.
 */
export async function resolveSearchCategoriesFromManifest(manifestUri: string): Promise<SearchCategory[]> {
  try {
    const manifestResponse = await axios.get<any>(manifestUri, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': SONOS_DEFAULTS.USER_AGENT },
    });

    const presentationMapUri: string | undefined = manifestResponse.data?.presentationMap?.uri;
    if (!presentationMapUri) {
      log.warn(TAG, `Manifest at ${manifestUri} has no presentationMap.uri`);
      return [];
    }

    const mapResponse = await axios.get<string>(presentationMapUri, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': SONOS_DEFAULTS.USER_AGENT },
      responseType: 'text',
      transformResponse: (data) => data,
    });

    return parseSearchCategoriesXml(mapResponse.data);
  } catch (error) {
    log.error(TAG, `Failed to resolve presentation map for ${manifestUri}`, error);
    return [];
  }
}

function parseSearchCategoriesXml(xml: string): SearchCategory[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) =>
      tagName === 'PresentationMap' || tagName === 'SearchCategories' || tagName === 'Category' || tagName === 'CustomCategory',
  });

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (error) {
    log.error(TAG, 'Failed to parse presentation map XML', error);
    return [];
  }

  const maps: any[] = parsed?.Presentation?.PresentationMap ?? [];
  const searchMap = maps.find((m) => m['@_type'] === 'Search');
  const searchCategoryBlocks: any[] = searchMap?.Match?.SearchCategories ?? [];

  const categories: SearchCategory[] = [];
  const multipleBlocks = searchCategoryBlocks.length >= 2;

  for (const block of searchCategoryBlocks) {
    const stringId: string | undefined = block['@_stringId'];
    const prefix = multipleBlocks && stringId ? `${stringId.replace(/search/gi, '').trim()} ` : '';

    const plainCategories: any[] = block.Category ?? [];
    const customCategories: any[] = block.CustomCategory ?? [];

    for (const category of [...plainCategories, ...customCategories]) {
      const id = category['@_id'];
      const mappedId = category['@_mappedId'];
      if (!id || !mappedId) continue;
      categories.push({ label: `${prefix}${id}`, mappedId: String(mappedId) });
    }
  }

  return categories;
}
