import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { AppLogo } from '../../components/common';
import { TVPillButton } from '../../components/tv';
import { APP_INFO } from '../../constants/appInfo';
import { openStoreListing, UpdateInfo } from '../../services/remoteConfig/versionCheck';

export interface ForceUpdateScreenProps {
  updateInfo: UpdateInfo;
}

/** Replaces the whole app while the installed version is below the remote min_version. */
export const ForceUpdateScreen: React.FC<ForceUpdateScreenProps> = ({ updateInfo }) => {
  const { t } = useTranslation();
  return (
  <View style={styles.root} testID="force-update-screen">
    <StatusBar hidden />
    <View style={styles.inner}>
      <AppLogo size={96} />
      <Text style={styles.title}>{t('app.forceUpdate.title')}</Text>
      <Text style={styles.message}>
        {t('app.forceUpdate.message', { appName: APP_INFO.NAME })}
      </Text>
      <View style={styles.versionBadge}>
        <Text style={styles.versionText}>
          {`${updateInfo.currentVersion}  →  ${updateInfo.latestVersion}`}
        </Text>
      </View>
      <TVPillButton
        label={t('app.forceUpdate.updateNow')}
        hasTVPreferredFocus
        onPress={() => openStoreListing(updateInfo.storeUrl)}
        testID="button-force-update"
      />
    </View>
  </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPaddingHorizontal,
  },
  inner: {
    maxWidth: 520,
    alignItems: 'center',
  },
  title: {
    marginTop: spacing.lg,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.sm,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  versionBadge: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
});
