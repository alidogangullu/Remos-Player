import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../../utils/logger';

const STORAGE_KEY = 'remos.announcements.readIds';

export const AnnouncementReadStore = {
  async getReadIds(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
    } catch (error) {
      log.warn('Announcements', 'Could not read read-state', error);
      return [];
    }
  },

  async saveReadIds(ids: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (error) {
      log.warn('Announcements', 'Could not save read-state', error);
    }
  },
};
