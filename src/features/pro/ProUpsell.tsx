import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { CheckIcon, useToast } from '../../components/common';
import { TVPillButton } from '../../components/tv';
import { ProFeature, usePro } from '../../services/billing/ProProvider';
import { ProBadge } from './ProBadge';

const FEATURE_KEYS = ['search', 'home', 'lyrics', 'sound', 'future'] as const;

export interface ProUpsellProps {
  /** Omit for the plain "Remos Pro" offer (Settings). */
  feature?: ProFeature;
  /** `wide` puts the feature list beside the pitch (full-screen tabs); `stacked` fits a settings pane. */
  layout?: 'wide' | 'stacked';
}

/** What Pro adds, its price and the unlock / restore actions. */
export const ProUpsell: React.FC<ProUpsellProps> = ({ feature, layout = 'wide' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { price, storeStatus, purchaseStatus, buyPro, restore } = usePro();
  const [isRestoring, setIsRestoring] = useState(false);

  const isPurchasing = purchaseStatus === 'purchasing';
  let unlockLabel = t('pro.unlock');
  if (isPurchasing) unlockLabel = t('pro.opening');
  else if (price) unlockLabel = t('pro.unlockWithPrice', { price });

  let statusText: string | null = null;
  if (purchaseStatus === 'pending') statusText = t('pro.status.pending');
  else if (purchaseStatus === 'failed') statusText = t('pro.status.failed');
  else if (purchaseStatus === 'unavailable') statusText = t('pro.status.productUnavailable');
  else if (storeStatus === 'unavailable') statusText = t('pro.status.unavailable');

  const handleRestore = async () => {
    setIsRestoring(true);
    const result = await restore();
    setIsRestoring(false);
    const message = t(`pro.restoreResult.${result}`);
    if (result === 'owned') toast.success(message);
    else if (result === 'unavailable') toast.error(message);
    else toast.info(message);
  };

  const isWide = layout === 'wide';

  return (
    <View style={[styles.root, isWide && styles.rootWide]}>
      <View style={[styles.pitch, isWide && styles.pitchWide]}>
        <ProBadge label={t('pro.eyebrow')} />
        {feature ? (
          <>
            <Text style={[styles.title, isWide && styles.titleWide]}>{t(`pro.locked.${feature}.title`)}</Text>
            <Text style={styles.body}>{t(`pro.locked.${feature}.body`)}</Text>
          </>
        ) : null}
        <Text style={styles.freeNote}>{t('pro.free')}</Text>

        <View style={styles.actions}>
          <TVPillButton
            variant="primary"
            label={unlockLabel}
            disabled={isPurchasing}
            onPress={buyPro}
            testID="button-unlock-pro"
          />
          <TVPillButton
            label={isRestoring ? t('pro.restoring') : t('pro.restore')}
            disabled={isRestoring}
            onPress={handleRestore}
            testID="button-restore-pro"
          />
        </View>
        {statusText ? (
          <Text style={[styles.status, purchaseStatus === 'failed' && styles.statusError]} accessibilityLiveRegion="polite">
            {statusText}
          </Text>
        ) : null}
        <Text style={styles.footnote}>{t('pro.footnote')}</Text>
      </View>

      <View style={[styles.features, isWide && styles.featuresWide]}>
        <Text style={styles.featuresTitle}>{t('pro.features.title')}</Text>
        {FEATURE_KEYS.map(key => (
          <View key={key} style={styles.featureRow}>
            <CheckIcon />
            <Text style={styles.featureText}>{t(`pro.features.${key}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  rootWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  pitch: {
    gap: spacing.sm,
  },
  pitchWide: {
    flex: 1.15,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginTop: spacing.xs,
  },
  titleWide: {
    fontSize: 30,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  freeNote: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  status: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statusError: {
    color: colors.statusError,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  features: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    gap: 14,
  },
  featuresWide: {
    flex: 1,
  },
  featuresTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
});
