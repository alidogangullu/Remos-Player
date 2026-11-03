import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { TVPillButton } from '../../components/tv';
import { ProFeature, usePro } from '../../services/billing/ProProvider';
import { ProBadge } from './ProBadge';

export interface ProTeaserCardProps {
  feature: Extract<ProFeature, 'sound'>;
}

/** One-card hint for Pro settings inside a free screen; the full offer lives in Settings › Remos Pro. */
export const ProTeaserCard: React.FC<ProTeaserCardProps> = ({ feature }) => {
  const { t } = useTranslation();
  const { requestUpgrade } = usePro();

  return (
    <View style={styles.card} testID={`pro-teaser-${feature}`}>
      <View style={styles.text}>
        <ProBadge label={t('pro.badge')} />
        <Text style={styles.title}>{t(`pro.teaser.${feature}.title`)}</Text>
        <Text style={styles.body}>{t(`pro.teaser.${feature}.body`)}</Text>
      </View>
      <TVPillButton
        label={t('pro.teaser.cta')}
        onPress={() => requestUpgrade(feature)}
        testID={`button-pro-teaser-${feature}`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
