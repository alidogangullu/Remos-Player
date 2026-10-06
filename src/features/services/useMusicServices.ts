import { useCallback, useEffect, useRef, useState } from 'react';
import { listMusicServices } from '../../services/sonos/smapi/musicServiceRegistry';
import { MusicAccountStore } from '../../services/sonos/accounts/musicAccountStore';
import { synchronizeMusicServices } from '../../services/sonos/accounts/musicAccountSync';
import { clearSearchCategoryCache } from '../../services/sonos/smapi/searchCategories';
import { SearchServiceFilterStore } from '../../services/search/searchServiceFilterStore';
import { log } from '../../utils/logger';
import { MusicService } from '../../services/sonos/smapi/smapiTypes';

const TAG = 'useMusicServices';

export interface LinkedService {
  service: MusicService;
  /** Always false now — kept on the type so callers don't need updating.
   * `ListAvailableServices` returns every service the speaker CAN offer,
   * including dozens of `Auth="Anonymous"` radio stations (Hit Network,
   * Triple M, ...) nobody asked for. Only services the user actually
   * linked (has a synced account for) belong in "Your Services". */
  isAnonymous: boolean;
}

export interface UseMusicServicesResult {
  services: LinkedService[];
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  /** Calls "Synchronize Music Services" — imports accounts already linked in the Sonos app. */
  synchronize: () => Promise<void>;
}

/**
 * Loads the services usable right now (anonymous services + services with a
 * synced account) for the "Your Services" row and, on demand, runs the
 * account sync ("Synchronize Music Services" — see `musicAccountSync.ts`).
 */
export function useMusicServices(speakerIp: string | undefined): UseMusicServicesResult {
  const [services, setServices] = useState<LinkedService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** Resolves to the linked services it loaded, or `null` if loading failed. */
  const reload = useCallback(async (): Promise<LinkedService[] | null> => {
    if (!speakerIp) {
      setServices([]);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    try {
      const [allServices, accounts] = await Promise.all([
        listMusicServices(speakerIp),
        MusicAccountStore.getAccounts(),
      ]);
      const accountServiceIds = new Set(accounts.map((a) => a.serviceId));

      const usable: LinkedService[] = allServices
        .filter((service) => accountServiceIds.has(service.serviceId))
        .map((service) => ({ service, isAnonymous: false }));

      if (isMountedRef.current) setServices(usable);
      return usable;
    } catch (error) {
      log.error(TAG, 'Failed to load music services', error);
      if (isMountedRef.current) setServices([]);
      return null;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [speakerIp]);

  useEffect(() => {
    reload();
  }, [reload]);

  const synchronize = useCallback(async () => {
    if (!speakerIp) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await synchronizeMusicServices(speakerIp);
      clearSearchCategoryCache();
      const linked = await reload();
      // A service the sync unlinked can't stay selected in the Search filter.
      if (linked) await SearchServiceFilterStore.retainOnly(linked.map(({ service }) => service.serviceId));
    } catch (error) {
      log.error(TAG, 'Synchronize Music Services failed', error);
      if (isMountedRef.current) {
        setSyncError(error instanceof Error ? error.message : 'Failed to synchronize music services');
      }
    } finally {
      if (isMountedRef.current) setIsSyncing(false);
    }
  }, [speakerIp, reload]);

  return { services, isLoading, isSyncing, syncError, synchronize };
}
