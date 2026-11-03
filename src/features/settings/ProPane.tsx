import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { CheckIcon, PaneHeader } from '../../components/common';
import { ProFeature, usePro } from '../../services/billing/ProProvider';
import { ProUpsell } from '../pro';
import { paneStyles } from './paneStyles';

export interface ProPaneProps {
  /** Set when a locked control sent the user here, so the pitch matches what they tried. */
  feature?: ProFeature;
}

/** Settings › Remos Pro: the offer, or a thank-you once it's unlocked. */
export const ProPane: React.FC<ProPaneProps> = ({ feature }) => {
  const { t } = useTranslation();
  const { isPro } = usePro();

  return (
    <ScrollView style={paneStyles.scroll} contentContainerStyle={paneStyles.content}>
      <PaneHeader title={t('pro.paneTitle')} subtitle={t('pro.paneSubtitle')} />
      {isPro ? (
        <View style={[paneStyles.card, styles.ownedCard]} testID="pro-owned-card">
          <View style={styles.ownedRow}>
            <CheckIcon size={22} />
            <Text style={styles.ownedTitle}>{t('pro.owned.title')}</Text>
          </View>
          <Text style={paneStyles.bodyText}>{t('pro.owned.body')}</Text>
        </View>
      ) : (
        <ProUpsell feature={feature} layout="stacked" />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  ownedCard: {
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  ownedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ownedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
