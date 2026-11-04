import { useTranslation } from 'react-i18next';
import { usePro } from '../../services/billing/ProProvider';

export interface ProOfferText {
  /** "Unlock Pro · $5.99", or "Opening Google Play…" while the Play sheet comes up. */
  unlockLabel: string;
  isPurchasing: boolean;
  /** Why buying isn't going ahead (pending, failed, unavailable); null when nothing to say. */
  statusText: string | null;
  isStatusError: boolean;
}

/** The buy button's label and the purchase status line, shared by every Pro offer. */
export function useProOfferText(): ProOfferText {
  const { t } = useTranslation();
  const { price, storeStatus, purchaseStatus } = usePro();

  const isPurchasing = purchaseStatus === 'purchasing';
  let unlockLabel = t('pro.unlock');
  if (isPurchasing) unlockLabel = t('pro.opening');
  else if (price) unlockLabel = t('pro.unlockWithPrice', { price });

  let statusText: string | null = null;
  if (purchaseStatus === 'pending') statusText = t('pro.status.pending');
  else if (purchaseStatus === 'failed') statusText = t('pro.status.failed');
  else if (purchaseStatus === 'unavailable') statusText = t('pro.status.productUnavailable');
  else if (storeStatus === 'unavailable') statusText = t('pro.status.unavailable');

  return { unlockLabel, isPurchasing, statusText, isStatusError: purchaseStatus === 'failed' };
}
