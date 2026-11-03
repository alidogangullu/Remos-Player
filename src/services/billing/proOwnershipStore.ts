import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../../utils/logger';

const STORAGE_KEY = 'remos.billing.proOwned';

/** Last known Pro ownership, so Pro stays unlocked offline and before Play answers. */
export const ProOwnershipStore = {
  async load(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
    } catch (error) {
      log.warn('Billing', 'Could not read cached Pro ownership', error);
      return false;
    }
  },

  async save(isOwned: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(isOwned));
    } catch (error) {
      log.warn('Billing', 'Could not cache Pro ownership', error);
    }
  },
};
