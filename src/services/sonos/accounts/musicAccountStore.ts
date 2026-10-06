import AsyncStorage from '@react-native-async-storage/async-storage';
import { MusicServiceAccount } from '../smapi/smapiTypes';

/**
 * Persists synced music-service accounts. Mirrors
 * `src/services/history/playbackHistoryService.ts` exactly: static class,
 * single AsyncStorage key, JSON array, `try/catch` that degrades to `[]`/no-op.
 */
const ACCOUNTS_KEY = 'SONOS_TV_MUSIC_ACCOUNTS';

export class MusicAccountStore {
  static async getAccounts(): Promise<MusicServiceAccount[]> {
    try {
      const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async saveAccounts(accounts: MusicServiceAccount[]): Promise<void> {
    try {
      await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {
      // Non-blocking storage error
    }
  }

  /**
   * Makes the persisted set match the accounts the speaker currently reports.
   *
   * The speaker's list is the truth for *which* accounts exist: anything it no
   * longer reports was unlinked (or the system was reset) and its token is dead,
   * so it is dropped. For a link we already hold (same `udn`), our copy wins — it
   * may carry a token `refreshAuthToken` renewed after the speaker's snapshot.
   */
  static async reconcile(speakerAccounts: MusicServiceAccount[]): Promise<MusicServiceAccount[]> {
    const current = await this.getAccounts();
    const reconciled = speakerAccounts.map(
      (fresh) =>
        current.find((held) => held.serviceId === fresh.serviceId && held.udn === fresh.udn) ?? fresh,
    );
    await this.saveAccounts(reconciled);
    return reconciled;
  }

  static async getAccountForService(serviceId: string): Promise<MusicServiceAccount | null> {
    const accounts = await this.getAccounts();
    return accounts.find((account) => account.serviceId === serviceId) ?? null;
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(ACCOUNTS_KEY);
  }
}
