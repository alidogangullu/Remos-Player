import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ErrorCode } from 'react-native-iap';
import { useToast } from '../../components/common';
import { log } from '../../utils/logger';
import { BillingService, ProOwnership, PurchaseFailure } from './billingService';
import { ProOwnershipStore } from './proOwnershipStore';

export type StoreStatus = 'connecting' | 'ready' | 'unavailable';
export type PurchaseStatus = 'idle' | 'purchasing' | 'pending' | 'unavailable' | 'failed';
export type RestoreResult = 'owned' | 'pending' | 'not_owned' | 'unavailable';
/** A Pro feature the user ran into; it picks the headline of the offer. */
export type ProFeature = 'home' | 'search' | 'favorites' | 'sound' | 'lyrics';

export interface UpgradeRequest {
  id: number;
  feature?: ProFeature;
}

interface ProContextValue {
  isPro: boolean;
  /** False until the cached ownership is read; keeps locked screens from flashing for Pro users. */
  isResolved: boolean;
  /** Localized price from Google Play, e.g. "$5.99"; null until loaded. */
  price: string | null;
  storeStatus: StoreStatus;
  purchaseStatus: PurchaseStatus;
  buyPro: () => void;
  restore: () => Promise<RestoreResult>;
  /** Set by requestUpgrade; the app answers by opening Settings › Remos Pro. */
  upgradeRequest: UpgradeRequest | null;
  requestUpgrade: (feature?: ProFeature) => void;
}

const ProContext = createContext<ProContextValue | undefined>(undefined);

export function ProProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = useTranslation();
  const toast = useToast();
  const [ownership, setOwnership] = useState<boolean | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [storeStatus, setStoreStatus] = useState<StoreStatus>('connecting');
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatus>('idle');
  const [upgradeRequest, setUpgradeRequest] = useState<UpgradeRequest | null>(null);
  const connectionRef = useRef<Promise<boolean> | null>(null);
  /** Ownership as last known (cache or Play); null until either answers. */
  const knownOwnershipRef = useRef<boolean | null>(null);
  // Through a ref so a language change doesn't reconnect billing.
  const unlockedMessageRef = useRef(t('pro.unlockedToast'));
  unlockedMessageRef.current = t('pro.unlockedToast');

  const applyOwnership = useCallback(
    (next: ProOwnership) => {
      const isOwned = next === 'owned';
      // Only a real change (a purchase or a redeemed promo code), not a startup re-check.
      if (isOwned && knownOwnershipRef.current === false) toast.success(unlockedMessageRef.current);
      knownOwnershipRef.current = isOwned;
      setOwnership(isOwned);
      ProOwnershipStore.save(isOwned);
      setPurchaseStatus(prev => {
        if (next === 'owned') return 'idle';
        if (next === 'pending') return 'pending';
        // Coming back from the Play sheet re-syncs before the purchase result lands; keep "purchasing".
        return prev === 'pending' ? 'idle' : prev;
      });
    },
    [toast],
  );

  /** Connects once; a failed attempt is retried by the next caller (e.g. Unlock pressed later). */
  const ensureConnected = useCallback((): Promise<boolean> => {
    connectionRef.current ??= BillingService.connect().then(isConnected => {
      setStoreStatus(isConnected ? 'ready' : 'unavailable');
      if (!isConnected) connectionRef.current = null;
      return isConnected;
    });
    return connectionRef.current;
  }, []);

  const sync = useCallback(async (): Promise<ProOwnership | null> => {
    if (!(await ensureConnected())) return null;
    const result = await BillingService.syncOwnership();
    // A failed read keeps the cached ownership instead of locking a paying user out offline.
    if (result) applyOwnership(result);
    return result;
  }, [applyOwnership, ensureConnected]);

  useEffect(() => {
    let isMounted = true;
    ProOwnershipStore.load().then(cached => {
      // Play may have answered first; its answer wins.
      if (!isMounted || knownOwnershipRef.current !== null) return;
      knownOwnershipRef.current = cached;
      setOwnership(cached);
    });
    const unsubscribe = BillingService.listen(applyOwnership, (failure: PurchaseFailure) => {
      if (failure === 'already_owned') {
        sync();
        return;
      }
      if (failure === 'cancelled') setPurchaseStatus('idle');
      else setPurchaseStatus(failure === 'unavailable' ? 'unavailable' : 'failed');
    });
    sync().then(() => BillingService.fetchProPrice()).then(loaded => {
      if (isMounted) setPrice(loaded);
    });
    return () => {
      isMounted = false;
      unsubscribe();
      BillingService.disconnect();
      connectionRef.current = null;
    };
  }, [applyOwnership, sync]);

  // Refunds and promo codes redeemed in the Play Store land while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [sync]);

  const buyPro = useCallback(() => {
    setPurchaseStatus('purchasing');
    ensureConnected()
      .then(async isConnected => {
        if (!isConnected) {
          setPurchaseStatus('failed');
          return;
        }
        if (!price) setPrice(await BillingService.fetchProPrice());
        await BillingService.buyPro();
      })
      .catch(error => {
        log.warn('Billing', 'Could not start the purchase', error);
        setPurchaseStatus(error?.code === ErrorCode.UserCancelled ? 'idle' : 'failed');
      });
  }, [ensureConnected, price]);

  const restore = useCallback(async (): Promise<RestoreResult> => {
    const result = await sync();
    return result ?? 'unavailable';
  }, [sync]);

  const requestUpgrade = useCallback((feature?: ProFeature) => {
    setUpgradeRequest(prev => ({ id: (prev?.id ?? 0) + 1, feature }));
  }, []);

  const value = useMemo(
    () => ({
      isPro: ownership === true,
      isResolved: ownership !== null,
      price,
      storeStatus,
      purchaseStatus,
      buyPro,
      restore,
      upgradeRequest,
      requestUpgrade,
    }),
    [ownership, price, storeStatus, purchaseStatus, buyPro, restore, upgradeRequest, requestUpgrade],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro(): ProContextValue {
  const context = useContext(ProContext);
  if (!context) throw new Error('usePro must be used within a ProProvider');
  return context;
}
