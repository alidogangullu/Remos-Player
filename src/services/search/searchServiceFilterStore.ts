import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persists which services the Search tab's filter chips have selected (by
 * `serviceId`). Mirrors `recentSearchesStore.ts`: static class, single
 * AsyncStorage key, JSON array, `try/catch` that degrades silently. An empty
 * list means nothing is searched until the user picks a service.
 */
const SEARCH_SERVICE_FILTER_KEY = 'SONOS_TV_SEARCH_SERVICE_FILTER';

export class SearchServiceFilterStore {
  static async getSelectedServiceIds(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(SEARCH_SERVICE_FILTER_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  static async setSelectedServiceIds(serviceIds: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(SEARCH_SERVICE_FILTER_KEY, JSON.stringify(serviceIds));
    } catch {
      // Non-blocking storage error
    }
  }

  /** Drops selections for services that are no longer linked (called after "Synchronize Music Services"). */
  static async retainOnly(linkedServiceIds: string[]): Promise<void> {
    const current = await this.getSelectedServiceIds();
    const retained = current.filter((id) => linkedServiceIds.includes(id));
    if (retained.length !== current.length) await this.setSelectedServiceIds(retained);
  }
}
