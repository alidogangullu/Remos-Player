import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { CheckIcon, useToast } from '../../components/common';
import { TVPillButton } from '../../components/tv';
import { usePro } from '../../services/billing/ProProvider';
import { ProBadge } from './ProBadge';
import { useProOfferText } from './useProOfferText';

const FEATURE_KEYS = ['search', 'home', 'lyrics', 'sound', 'future'] as const;

/** Settings › Remos Pro: what Pro adds, its price and the unlock / restore actions. */
export const ProUpsell: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { buyPro, restore } = usePro();
  const { unlockLabel, isPurchasing, statusText, isStatusError } = useProOfferText();
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    setIsRestoring(true);
    const result = await restore();
    setIsRestoring(false);
    const message = t(`pro.restoreResult.${result}`);
    if (result === 'owned') toast.success(message);
    else if (result === 'unavailable') toast.error(message);
    else toast.info(message);
  };

  return (
    <View style={styles.root}>
      <View style={styles.pitch}>
        <ProBadge label={t('pro.eyebrow')} />
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
          <Text style={[styles.status, isStatusError && styles.statusError]} accessibilityLiveRegion="polite">
            {statusText}
          </Text>
        ) : null}
        <Text style={styles.footnote}>{t('pro.footnote')}</Text>
      </View>

      <View style={styles.features}>
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
  pitch: {
    gap: spacing.sm,
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
