import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { NotificationDot, PaneHeader } from '../../components/common';
import { TVPillButton } from '../../components/tv';
import { APP_INFO } from '../../constants/appInfo';
import { useRemoteConfig } from '../../services/remoteConfig/RemoteConfigProvider';
import { openStoreListing } from '../../services/remoteConfig/versionCheck';
import { paneStyles } from './paneStyles';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const UpdatePane: React.FC = () => {
  const { updateInfo, refresh, isRefreshing, lastCheckedAt } = useRemoteConfig();
  const [checkFailed, setCheckFailed] = useState(false);

  const hasUpdate = updateInfo?.status === 'optional_update';

  const handleCheck = async () => {
    setCheckFailed(!(await refresh()));
  };

  let statusTitle: string;
  let statusDetail: string;
  if (!updateInfo) {
    statusTitle = isRefreshing ? 'Checking for updates…' : "Couldn't check for updates";
    statusDetail = `You have version ${APP_INFO.VERSION}.`;
  } else if (hasUpdate) {
    statusTitle = `Version ${updateInfo.latestVersion} is available`;
    statusDetail = `You have version ${updateInfo.currentVersion}. Update from the Google Play Store.`;
  } else {
    statusTitle = 'Remos Player is up to date';
    statusDetail = `Version ${updateInfo.currentVersion}`;
  }

  let checkNote: string | null = null;
  if (checkFailed) checkNote = "Couldn't reach the update server. Check your internet connection.";
  else if (lastCheckedAt) checkNote = `Last checked at ${formatTime(lastCheckedAt)}`;

  return (
    <ScrollView style={paneStyles.scroll} contentContainerStyle={paneStyles.content}>
      <PaneHeader
        title="Software Update"
        subtitle="Remos Player checks for new versions automatically"
      />

      <View style={[paneStyles.card, hasUpdate && styles.cardHighlighted]} testID="update-status-card">
        <View style={styles.statusRow}>
          {hasUpdate ? <NotificationDot size={10} /> : null}
          <Text style={styles.statusTitle}>{statusTitle}</Text>
        </View>
        <Text style={paneStyles.bodyText}>{statusDetail}</Text>

        {hasUpdate && updateInfo.releaseNotes.length > 0 ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>What's new</Text>
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
              label="Update Now"
              onPress={() => openStoreListing(updateInfo.storeUrl)}
              testID="button-update-now"
            />
          ) : null}
          <TVPillButton
            label={isRefreshing ? 'Checking…' : 'Check for Updates'}
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
