import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TVFocusGuideView, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { TVSideTab } from '../../components/tv';
import { SonosDevice } from '../../types/sonos';
import { useRemoteConfig } from '../../services/remoteConfig/RemoteConfigProvider';
import { describeRoomHardware } from '../../services/sonos/roomDisplay';
import { SoundSettingsPane } from './SoundSettingsPane';
import { NotificationsPane } from './NotificationsPane';
import { UpdatePane } from './UpdatePane';
import { AboutPane } from './AboutPane';

type SettingsSection = 'sound' | 'notifications' | 'update' | 'about';

export interface SettingsScreenProps {
  speaker: SonosDevice | null;
}

/** Settings: the room and section rail on the left, the selected section on the right. */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({ speaker }) => {
  const { updateInfo, hasUnreadAnnouncements } = useRemoteConfig();
  const [section, setSection] = useState<SettingsSection>('sound');
  // Visited panes stay mounted so the speaker isn't re-probed on every switch.
  const [visited, setVisited] = useState<SettingsSection[]>(['sound']);
  useEffect(() => {
    setVisited(prev => (prev.includes(section) ? prev : [...prev, section]));
  }, [section]);

  const tabs: { id: SettingsSection; label: string; showBadge?: boolean }[] = [
    { id: 'sound', label: 'Sound' },
    { id: 'notifications', label: 'Notifications', showBadge: hasUnreadAnnouncements },
    { id: 'update', label: 'Update', showBadge: updateInfo?.status === 'optional_update' },
    { id: 'about', label: 'About' },
  ];

  const renderPane = (id: SettingsSection, node: React.ReactNode) => {
    if (section !== id && !visited.includes(id)) return null;
    // display:none also takes the hidden pane out of D-pad focus search.
    return (
      <View key={id} style={[styles.pane, section !== id && styles.paneHidden]}>
        {node}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* autoFocus returns D-pad entry to the last focused tab — the active one — instead
          of the nearest tab, which would switch sections just by moving into the rail. */}
      <TVFocusGuideView autoFocus style={styles.rail} accessibilityRole="tablist">
        <Text style={styles.roomName} numberOfLines={1}>
          {speaker?.name || 'Settings'}
        </Text>
        <Text style={styles.roomHardware} numberOfLines={2}>
          {speaker ? describeRoomHardware(speaker) : 'No speaker connected'}
        </Text>
        <View style={styles.tabList}>
          {tabs.map(tab => (
            <TVSideTab
              key={tab.id}
              label={tab.label}
              active={section === tab.id}
              showBadge={tab.showBadge}
              onFocus={() => setSection(tab.id)}
              onPress={() => setSection(tab.id)}
              testID={`settings-tab-${tab.id}`}
            />
          ))}
        </View>
      </TVFocusGuideView>

      <View style={styles.content}>
        {renderPane('sound', <SoundSettingsPane speaker={speaker} />)}
        {renderPane('notifications', <NotificationsPane isActive={section === 'notifications'} />)}
        {renderPane('update', <UpdatePane />)}
        {renderPane('about', <AboutPane />)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
  pane: {
    flex: 1,
  },
  paneHidden: {
    display: 'none',
  },
  rail: {
    width: 230,
    paddingTop: 76,
    paddingLeft: 36,
  },
  roomName: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  roomHardware: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  tabList: {
    marginTop: spacing.lg,
    gap: 4,
  },
});
