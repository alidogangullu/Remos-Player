import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TVFocusGuideView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { TVSideTab } from '../../components/tv';
import { SonosDevice } from '../../types/sonos';
import { useRemoteConfig } from '../../services/remoteConfig/RemoteConfigProvider';
import { describeRoomHardware } from '../../services/sonos/roomDisplay';
import { ProFeature, UpgradeRequest } from '../../services/billing/ProProvider';
import { SoundSettingsPane } from './SoundSettingsPane';
import { LanguagePane } from './LanguagePane';
import { NotificationsPane } from './NotificationsPane';
import { UpdatePane } from './UpdatePane';
import { AboutPane } from './AboutPane';
import { ProPane } from './ProPane';

type SettingsSection = 'pro' | 'sound' | 'language' | 'notifications' | 'update' | 'about';

export interface SettingsScreenProps {
  speaker: SonosDevice | null;
  /** A locked control asked for Pro: switch to the Remos Pro section. */
  upgradeRequest?: UpgradeRequest | null;
  /** Whether the Settings tab is on screen; D-pad focus can only move to a visible tab. */
  isActive?: boolean;
}

/** Settings: the room and section rail on the left, the selected section on the right. */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({ speaker, upgradeRequest, isActive = true }) => {
  const { t } = useTranslation();
  const { updateInfo, hasUnreadAnnouncements } = useRemoteConfig();
  const [section, setSection] = useState<SettingsSection>(upgradeRequest ? 'pro' : 'sound');
  const [proFeature, setProFeature] = useState<ProFeature | undefined>(upgradeRequest?.feature);
  // Visited panes stay mounted so the speaker isn't re-probed on every switch.
  const [visited, setVisited] = useState<SettingsSection[]>([section]);
  useEffect(() => {
    setVisited(prev => (prev.includes(section) ? prev : [...prev, section]));
  }, [section]);
  const proTabRef = useRef<View>(null);
  const isProFocusPendingRef = useRef(false);
  useEffect(() => {
    if (!upgradeRequest) return;
    setSection('pro');
    setProFeature(upgradeRequest.feature);
    isProFocusPendingRef.current = true;
  }, [upgradeRequest]);
  // Focus moves too: the pressed control disappears with its pane, and focus falling
  // back onto that pane's rail tab would select it again right away.
  useEffect(() => {
    if (!isActive || !isProFocusPendingRef.current) return;
    isProFocusPendingRef.current = false;
    (proTabRef.current as any)?.requestTVFocus?.();
  }, [isActive, upgradeRequest]);

  const tabs: { id: SettingsSection; showBadge?: boolean }[] = [
    { id: 'pro' },
    { id: 'sound' },
    { id: 'language' },
    { id: 'notifications', showBadge: hasUnreadAnnouncements },
    { id: 'update', showBadge: updateInfo?.status === 'optional_update' },
    { id: 'about' },
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
      <View style={styles.rail}>
        <Text style={styles.roomName} numberOfLines={1}>
          {speaker?.name || t('settings.title')}
        </Text>
        <Text style={styles.roomHardware} numberOfLines={2}>
          {speaker ? describeRoomHardware(speaker) : t('settings.noSpeaker')}
        </Text>
        {/* autoFocus returns D-pad entry to the last focused tab — the active one — instead
            of the nearest tab, which would switch sections just by moving into the rail.
            It wraps only the tabs: from outside, Android sees the guide as one focusable with
            its own bounds, and bounds reaching up under the absolute TopBar are never a DOWN
            target from it, leaving no way in when the pane has nothing focusable. */}
        <TVFocusGuideView autoFocus style={styles.tabList} accessibilityRole="tablist">
          {tabs.map(tab => (
            <TVSideTab
              key={tab.id}
              ref={tab.id === 'pro' ? proTabRef : undefined}
              label={t(`settings.tabs.${tab.id}`)}
              active={section === tab.id}
              showBadge={tab.showBadge}
              onFocus={() => setSection(tab.id)}
              onPress={() => setSection(tab.id)}
              testID={`settings-tab-${tab.id}`}
            />
          ))}
        </TVFocusGuideView>
      </View>

      <View style={styles.content}>
        {renderPane('pro', <ProPane feature={proFeature} />)}
        {renderPane('sound', <SoundSettingsPane speaker={speaker} />)}
        {renderPane('language', <LanguagePane />)}
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
