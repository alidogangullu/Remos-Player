import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { formatTime } from '../../i18n';
import { NotificationDot, PaneHeader } from '../../components/common';
import { TVPillButton } from '../../components/tv';
import { APP_INFO } from '../../constants/appInfo';
import { useRemoteConfig } from '../../services/remoteConfig/RemoteConfigProvider';
import { openStoreListing } from '../../services/remoteConfig/versionCheck';
import { paneStyles } from './paneStyles';

export const UpdatePane: React.FC = () => {
  const { t } = useTranslation();
  const { updateInfo, refresh, isRefreshing, lastCheckedAt } = useRemoteConfig();
  const [checkFailed, setCheckFailed] = useState(false);

  const hasUpdate = updateInfo?.status === 'optional_update';

  const handleCheck = async () => {
    setCheckFailed(!(await refresh()));
  };

  let statusTitle: string;
  let statusDetail: string;
  if (!updateInfo) {
    statusTitle = isRefreshing ? t('settings.update.checking') : t('settings.update.checkFailed');
    statusDetail = t('settings.update.youHaveVersion', { version: APP_INFO.VERSION });
  } else if (hasUpdate) {
    statusTitle = t('settings.update.available', { version: updateInfo.latestVersion });
    statusDetail = t('settings.update.availableDetail', { version: updateInfo.currentVersion });
  } else {
    statusTitle = t('settings.update.upToDate');
    statusDetail = t('settings.update.versionLabel', { version: updateInfo.currentVersion });
  }

  let checkNote: string | null = null;
  if (checkFailed) checkNote = t('settings.update.serverUnreachable');
  else if (lastCheckedAt) checkNote = t('settings.update.lastChecked', { time: formatTime(lastCheckedAt) });

  return (
    <ScrollView style={paneStyles.scroll} contentContainerStyle={paneStyles.content}>
      <PaneHeader
        title={t('settings.update.title')}
        subtitle={t('settings.update.subtitle')}
      />

      <View style={[paneStyles.card, hasUpdate && styles.cardHighlighted]} testID="update-status-card">
        <View style={styles.statusRow}>
          {hasUpdate ? <NotificationDot size={10} /> : null}
          <Text style={styles.statusTitle}>{statusTitle}</Text>
        </View>
        <Text style={paneStyles.bodyText}>{statusDetail}</Text>

        {hasUpdate && updateInfo.releaseNotes.length > 0 ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t('settings.update.whatsNew')}</Text>
            {updateInfo.releaseNotes.map(note => (
              <Text key={note} style={paneStyles.bodyText}>
                {`•  ${note}`}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          {hasUpdate ? (
            <TVPillButton
              label={t('settings.update.updateNow')}
              onPress={() => openStoreListing(updateInfo.storeUrl)}
              testID="button-update-now"
            />
          ) : null}
          <TVPillButton
            label={isRefreshing ? t('settings.update.checkingButton') : t('settings.update.checkButton')}
            disabled={isRefreshing}
            onPress={handleCheck}
            testID="button-check-updates"
          />
        </View>
        {checkNote ? <Text style={[paneStyles.mutedText, styles.checkNote]}>{checkNote}</Text> : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  cardHighlighted: {
    borderColor: 'rgba(229, 169, 60, 0.45)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  notes: {
    marginTop: spacing.md,
    gap: 2,
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  checkNote: {
    marginTop: spacing.md,
  },
});
