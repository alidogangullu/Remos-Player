import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_STORE_URL, REMOTE_CONFIG_URL } from '../../constants/appInfo';
import { log } from '../../utils/logger';

const TAG = 'RemoteConfig';
const FETCH_TIMEOUT_MS = 5000;
const CACHE_KEY = 'remos.remoteConfig.cache';

export interface Announcement {
  /** Stable id; read state is stored per id, so never reuse one. */
  id: string;
  title: string;
  body: string;
  /** Optional ISO date (YYYY-MM-DD), shown as-is. */
  date?: string;
}

export interface RemoteConfig {
  /** Installed versions below this are blocked by the force-update screen. */
  minVersion: string;
  /** Installed versions below this see the optional update prompt. */
  latestVersion: string;
  storeUrl: string;
  releaseNotes: string[];
  announcements: Announcement[];
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

function parseAnnouncements(raw: unknown): Announcement[] {
  if (!Array.isArray(raw)) return [];
  const list = raw.filter(
    (a): a is Announcement =>
      a !== null &&
      typeof a === 'object' &&
      isNonEmptyString(a.id) &&
      isNonEmptyString(a.title) &&
      isNonEmptyString(a.body) &&
      (a.date === undefined || typeof a.date === 'string'),
  );
  if (list.length !== raw.length) {
    log.warn(TAG, `Dropped ${raw.length - list.length} malformed announcement(s)`);
  }
  return list;
}

/** Returns null when the payload is missing the version fields the gate needs. */
export function parseRemoteConfig(data: any): RemoteConfig | null {
  if (!data || typeof data !== 'object') return null;
  if (!isNonEmptyString(data.min_version) || !isNonEmptyString(data.latest_version)) {
    log.warn(TAG, 'Config is missing min_version/latest_version');
    return null;
  }
  return {
    minVersion: data.min_version.trim(),
    latestVersion: data.latest_version.trim(),
    storeUrl: isNonEmptyString(data.store_url) ? data.store_url.trim() : DEFAULT_STORE_URL,
    releaseNotes: Array.isArray(data.release_notes)
      ? data.release_notes.filter(isNonEmptyString)
      : [],
    announcements: parseAnnouncements(data.announcements),
  };
}

export const RemoteConfigService = {
  /**
   * Fetches the Gist config and caches it. Resolves to null on any failure so
   * a network problem never blocks the app.
   */
  async fetch(): Promise<RemoteConfig | null> {
    try {
      // Cache-buster: raw.githubusercontent responses are CDN-cached for minutes.
      const response = await axios.get(`${REMOTE_CONFIG_URL}?t=${Date.now()}`, {
        timeout: FETCH_TIMEOUT_MS,
      });
      const config = parseRemoteConfig(response.data);
      if (config) {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(response.data)).catch(error =>
          log.warn(TAG, 'Could not cache config', error),
        );
      }
      return config;
    } catch (error) {
      log.warn(TAG, 'Fetch failed', error);
      return null;
    }
  },

  /** Last successfully fetched config, so a force update holds even offline. */
  async getCached(): Promise<RemoteConfig | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      return raw ? parseRemoteConfig(JSON.parse(raw)) : null;
    } catch (error) {
      log.warn(TAG, 'Could not read cached config', error);
      return null;
    }
  },
};
