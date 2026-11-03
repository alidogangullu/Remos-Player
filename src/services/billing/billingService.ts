import {
  ErrorCode,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
  type PurchaseAndroid,
  type PurchaseError,
} from 'react-native-iap';
import { log } from '../../utils/logger';

const TAG = 'Billing';

/** One-time (non-consumable) product in Play Console that unlocks Remos Pro. */
export const PRO_PRODUCT_ID = 'pro_lifetime';

export type ProOwnership = 'owned' | 'pending' | 'not_owned';

export type PurchaseFailure = 'cancelled' | 'already_owned' | 'unavailable' | 'failed';

/** Play can't find or sell the product: not set up, inactive, or not offered in this country. */
const PRODUCT_UNAVAILABLE_CODES: string[] = [
  ErrorCode.QueryProduct,
  ErrorCode.ItemUnavailable,
  ErrorCode.SkuNotFound,
];

const isProPurchase = (purchase: Purchase) => purchase.productId === PRO_PRODUCT_ID;

/**
 * Play refunds and revokes a purchase that isn't acknowledged within 3 days, so
 * every completed Pro purchase is acknowledged as soon as the app sees it.
 * Pending payments can't be acknowledged until they complete.
 */
async function acknowledgeIfNeeded(purchase: Purchase): Promise<void> {
  if (purchase.purchaseState !== 'purchased') return;
  if ((purchase as PurchaseAndroid).isAcknowledgedAndroid === true) return;
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch (error) {
    // The billing connection can drop while the Play purchase sheet has the app in the
    // background, and finishTransaction doesn't reconnect; reconnect and retry once.
    log.debug(TAG, 'Acknowledgement failed, reconnecting', error);
    await initConnection();
    await finishTransaction({ purchase, isConsumable: false });
  }
  log.debug(TAG, 'Acknowledged Pro purchase');
}

export const BillingService = {
  /** Resolves to false when Google Play Billing isn't available on this device. */
  async connect(): Promise<boolean> {
    try {
      return await initConnection();
    } catch (error) {
      log.warn(TAG, 'Could not connect to Google Play Billing', error);
      return false;
    }
  },

  disconnect(): void {
    endConnection().catch(error => log.warn(TAG, 'Could not end billing connection', error));
  },

  /** The localized price, e.g. "$5.99"; null when the product can't be loaded. */
  async fetchProPrice(): Promise<string | null> {
    try {
      const products = await fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' });
      const pro = products?.find(product => product.id === PRO_PRODUCT_ID);
      return pro?.displayPrice ?? null;
    } catch (error) {
      log.warn(TAG, 'Could not load the Pro product', error);
      return null;
    }
  },

  /**
   * Reads the purchases Play has on record and acknowledges any that aren't yet.
   * This also picks up promo codes redeemed in the Play Store and purchases whose
   * acknowledgement was cut off. Resolves to null when Play can't be reached.
   */
  async syncOwnership(): Promise<ProOwnership | null> {
    try {
      const purchases = (await getAvailablePurchases()).filter(isProPurchase);
      const completed = purchases.find(p => p.purchaseState === 'purchased');
      if (completed) {
        await acknowledgeIfNeeded(completed);
        return 'owned';
      }
      return purchases.some(p => p.purchaseState === 'pending') ? 'pending' : 'not_owned';
    } catch (error) {
      log.warn(TAG, 'Could not read purchases', error);
      return null;
    }
  },

  /** Opens the Google Play purchase sheet; the outcome arrives through the listeners. */
  async buyPro(): Promise<void> {
    await requestPurchase({
      type: 'in-app',
      request: { google: { skus: [PRO_PRODUCT_ID] } },
    });
  },

  /**
   * Subscribes to purchase results. `onOwnership` fires for Pro purchases only,
   * after a completed one has been acknowledged.
   */
  listen(
    onOwnership: (ownership: ProOwnership) => void,
    onFailure: (failure: PurchaseFailure) => void,
  ): () => void {
    const updated = purchaseUpdatedListener(async purchase => {
      if (!isProPurchase(purchase)) return;
      if (purchase.purchaseState === 'pending') {
        onOwnership('pending');
        return;
      }
      if (purchase.purchaseState !== 'purchased') return;
      try {
        await acknowledgeIfNeeded(purchase);
      } catch (error) {
        // Still owned: the next sync retries the acknowledgement well within 3 days.
        log.warn(TAG, 'Could not acknowledge Pro purchase', error);
      }
      onOwnership('owned');
    });
    const failed = purchaseErrorListener((error: PurchaseError) => {
      if (error.code === ErrorCode.UserCancelled) {
        onFailure('cancelled');
      } else if (error.code === ErrorCode.AlreadyOwned) {
        onFailure('already_owned');
      } else if (PRODUCT_UNAVAILABLE_CODES.includes(error.code)) {
        log.warn(TAG, `Pro product unavailable: ${error.code}`);
        onFailure('unavailable');
      } else {
        log.warn(TAG, `Purchase failed: ${error.code}`, error.debugMessage ?? error.message);
        onFailure('failed');
      }
    });
    return () => {
      updated.remove();
      failed.remove();
    };
  },
};
