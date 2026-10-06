import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persists recent search queries. Mirrors
 * `src/services/history/playbackHistoryService.ts`: static class, single
 * AsyncStorage key, JSON array, capped, `try/catch` that degrades silently.
 */
const RECENT_SEARCHES_KEY = 'SONOS_TV_RECENT_SEARCHES';
const MAX_RECENT_SEARCHES = 12;

export class RecentSearchesStore {
  static async getRecentSearches(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async addSearch(term: string): Promise<void> {
    const cleaned = term.trim();
    if (cleaned.length < 2) return;

    try {
      const current = await this.getRecentSearches();
      const filtered = current.filter((existing) => existing.toLowerCase() !== cleaned.toLowerCase());
      const updated = [cleaned, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Non-blocking storage error
    }
  }

  static async removeSearch(term: string): Promise<void> {
    try {
      const current = await this.getRecentSearches();
      const updated = current.filter((existing) => existing.toLowerCase() !== term.toLowerCase());
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Non-blocking storage error
    }
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  }
}
