import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLanguageCode, LanguagePreference } from './languages';
import { log } from '../utils/logger';

const TAG = 'LanguageStore';
const STORAGE_KEY = 'remos.language';

export const LanguageStore = {
  async getPreference(): Promise<LanguagePreference> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return isLanguageCode(stored) ? stored : 'system';
    } catch (error) {
      log.warn(TAG, 'Failed to read the language preference', error);
      return 'system';
    }
  },

  async setPreference(preference: LanguagePreference): Promise<void> {
    try {
      if (preference === 'system') await AsyncStorage.removeItem(STORAGE_KEY);
      else await AsyncStorage.setItem(STORAGE_KEY, preference);
    } catch (error) {
      log.warn(TAG, 'Failed to save the language preference', error);
    }
  },
};
