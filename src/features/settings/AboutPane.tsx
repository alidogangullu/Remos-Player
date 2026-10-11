import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { AppLogo, PaneHeader } from '../../components/common';
import { APP_INFO } from '../../constants/appInfo';
import { paneStyles } from './paneStyles';

const INFO_ROWS: { label: string; value: string }[] = [
  { label: 'Version', value: APP_INFO.VERSION },
  { label: 'Website', value: APP_INFO.WEBSITE },
  { label: 'Support', value: APP_INFO.SUPPORT_EMAIL },
  { label: 'Privacy Policy', value: APP_INFO.PRIVACY_URL },
];

export const AboutPane: React.FC = () => (
  <ScrollView style={paneStyles.scroll} contentContainerStyle={paneStyles.content}>
    <PaneHeader title="About" />

    <View style={styles.columns}>
      <View style={styles.identity}>
        <View style={styles.identityRow}>
          <AppLogo size={72} />
          <View style={styles.identityText}>
            <Text style={styles.appName}>{APP_INFO.NAME}</Text>
            <Text style={paneStyles.mutedText}>{`Version ${APP_INFO.VERSION}`}</Text>
          </View>
        </View>
        <Text style={[paneStyles.bodyText, styles.description]}>
          Browse, search and control your Sonos system with your TV remote. Remos Player talks to
          your speakers directly over your local network.
        </Text>
        <Text style={paneStyles.mutedText}>
          Synchronized lyrics are provided by LRCLib (lrclib.net).
        </Text>
      </View>

      <View style={[paneStyles.card, styles.infoCard]}>
        {INFO_ROWS.map((row, index) => (
          // Label above value: URLs are too long to share a line with their label.
          <View
            key={row.label}
            style={[styles.infoRow, index < INFO_ROWS.length - 1 && styles.infoRowDivider]}
          >
            <Text style={styles.infoLabel}>{row.label}</Text>
            <Text style={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>

    <Text style={[paneStyles.mutedText, styles.legal]}>
      Remos Player is an independent project. It is not affiliated with, endorsed by or sponsored
      by Sonos, Inc. Sonos is a trademark of Sonos, Inc. Android TV and Google Play are trademarks
      of Google LLC.
    </Text>
  </ScrollView>
);

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
