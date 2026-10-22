import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { AppLogo, PaneHeader } from '../../components/common';
import { APP_INFO } from '../../constants/appInfo';
import { paneStyles } from './paneStyles';

const INFO_ROWS = [
  { id: 'version', value: APP_INFO.VERSION },
  { id: 'website', value: APP_INFO.WEBSITE },
  { id: 'support', value: APP_INFO.SUPPORT_EMAIL },
  { id: 'privacy', value: APP_INFO.PRIVACY_URL },
] as const;

export const AboutPane: React.FC = () => {
  const { t } = useTranslation();
  return (
  <ScrollView style={paneStyles.scroll} contentContainerStyle={paneStyles.content}>
    <PaneHeader title={t('settings.about.title')} />

    <View style={styles.columns}>
      <View style={styles.identity}>
        <View style={styles.identityRow}>
          <AppLogo size={72} />
          <View style={styles.identityText}>
            <Text style={styles.appName}>{APP_INFO.NAME}</Text>
            <Text style={paneStyles.mutedText}>{t('settings.about.version', { version: APP_INFO.VERSION })}</Text>
          </View>
        </View>
        <Text style={[paneStyles.bodyText, styles.description]}>{t('settings.about.description')}</Text>
        <Text style={paneStyles.mutedText}>{t('settings.about.lyricsCredit')}</Text>
      </View>

      <View style={[paneStyles.card, styles.infoCard]}>
        {INFO_ROWS.map((row, index) => (
          // Label above value: URLs are too long to share a line with their label.
          <View
            key={row.id}
            style={[styles.infoRow, index < INFO_ROWS.length - 1 && styles.infoRowDivider]}
          >
            <Text style={styles.infoLabel}>{t(`settings.about.rows.${row.id}`)}</Text>
            <Text style={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>

    <Text style={[paneStyles.mutedText, styles.legal]}>{t('settings.about.legal')}</Text>
  </ScrollView>
  );
};

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'flex-start',
  },
  identity: {
    flex: 1,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  identityText: {
    flex: 1,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  description: {
    marginBottom: spacing.sm,
  },
  infoCard: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  infoRow: {
    paddingVertical: 10,
    gap: 2,
  },
  infoRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  legal: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 18,
  },
});
