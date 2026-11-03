import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, StatusBar, View, Text, BackHandler, Platform, ToastAndroid } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LanguageProvider } from './src/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from './src/theme';
import { TopBar, TopBarTab } from './src/features/home/TopBar';
import { HomeScreen } from './src/features/home/HomeScreen';
import { SearchScreen } from './src/features/search/SearchScreen';
import { NowPlayingScreen } from './src/features/nowPlaying/NowPlayingScreen';
import { FavoritesScreen } from './src/features/favorites/FavoritesScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { SystemScreen } from './src/features/system/SystemScreen';
import { SonosDiscoveryService } from './src/services/sonos/discovery/sonosDiscoveryService';
import { SonosUpnpClient } from './src/services/sonos/upnp/sonosUpnpClient';
import { useSmartTvAutoplay } from './src/services/sonos/autoplay/useSmartTvAutoplay';
import { SonosDevice } from './src/types/sonos';
import {
  RoomPreferences,
  RoomPreferencesStore,
  EMPTY_ROOM_PREFERENCES,
  partitionRooms,
  pickRoom,
  toggleRoomHidden,
} from './src/services/sonos/roomPreferences';
import { TVPillButton } from './src/components/tv';
import { ToastProvider } from './src/components/common';
import { useBackHandler } from './src/hooks';
import { RemoteConfigProvider, useRemoteConfig } from './src/services/remoteConfig/RemoteConfigProvider';
import { ForceUpdateScreen } from './src/features/update/ForceUpdateScreen';
import { ProProvider, ProFeature, usePro } from './src/services/billing/ProProvider';
import { ProLockedScreen } from './src/features/pro';

const NOW_PLAYING_POLL_MS = 5000;
/** A second Back within this window exits the app; matches ToastAndroid.SHORT (~2s) so it ends with the hint. */
const EXIT_CONFIRM_MS = 2000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { t } = useTranslation();
  const { updateInfo, hasUnreadAnnouncements } = useRemoteConfig();
  const { isPro, isResolved: isProResolved, upgradeRequest } = usePro();
  const [activeTab, setActiveTab] = useState<TopBarTab>('home');
  // Home is a Pro screen, so the free app starts on, and backs out to, Now Playing.
  const homeTab: TopBarTab = isProResolved && !isPro ? 'nowPlaying' : 'home';
  const hasPickedStartTabRef = useRef(false);
  useEffect(() => {
    if (!isProResolved || hasPickedStartTabRef.current) return;
    hasPickedStartTabRef.current = true;
    if (!isPro) setActiveTab(prev => (prev === 'home' ? 'nowPlaying' : prev));
  }, [isProResolved, isPro]);
  // Pro tabs wait for the cached ownership so a Pro user never sees the offer flash by.
  const renderProTab = (feature: ProFeature, node: React.ReactNode) => {
    if (!isProResolved) return null;
    return isPro ? node : <ProLockedScreen feature={feature} />;
  };
  // Tabs stay mounted (hidden) after their first visit so switching back doesn't reload them.
  const [visitedTabs, setVisitedTabs] = useState<TopBarTab[]>(['home']);
  useEffect(() => {
    setVisitedTabs((prev) => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
  }, [activeTab]);
  const renderTab = (tab: TopBarTab, node: React.ReactNode) => {
    const isActive = activeTab === tab;
    if (!isActive && !visitedTabs.includes(tab)) return null;
    // display:none also removes the hidden screen from D-pad focus search.
    return <View style={[styles.tabPane, !isActive && styles.tabHidden]}>{node}</View>;
  };
  const [speaker, setSpeaker] = useState<SonosDevice | null>(null);
  const [speakers, setSpeakers] = useState<SonosDevice[]>([]);
  // Last picked room and hidden rooms; read from storage before the first scan picks a room.
  const [roomPrefs, setRoomPrefs] = useState<RoomPreferences>(EMPTY_ROOM_PREFERENCES);
  const roomPrefsRef = useRef<RoomPreferences>(EMPTY_ROOM_PREFERENCES);
  const roomPrefsLoadRef = useRef<Promise<void> | null>(null);
  const updateRoomPrefs = useCallback((update: (prev: RoomPreferences) => RoomPreferences) => {
    const next = update(roomPrefsRef.current);
    roomPrefsRef.current = next;
    setRoomPrefs(next);
    RoomPreferencesStore.save(next);
  }, []);

  // App-level Back, reached only when no open panel or sub-view handled it:
  // content → TopBar → Home tab → "press again" hint → exit.
  const [isTopBarFocused, setIsTopBarFocused] = useState(false);
  const [topBarFocusSignal, setTopBarFocusSignal] = useState(0);
  const isExitArmedRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);
  const disarmExit = useCallback(() => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
    isExitArmedRef.current = false;
  }, []);
  // Focus leaving the TopBar, or picking another tab, cancels a pending exit.
  const handleTopBarFocusWithin = useCallback((isFocusWithin: boolean) => {
    setIsTopBarFocused(isFocusWithin);
    if (!isFocusWithin) disarmExit();
  }, [disarmExit]);
  const selectTab = useCallback((tab: TopBarTab) => {
    disarmExit();
    setActiveTab(tab);
  }, [disarmExit]);
  useBackHandler(true, () => {
    if (!isTopBarFocused) {
      setTopBarFocusSignal((n) => n + 1);
      return;
    }
    if (activeTab !== homeTab) {
      selectTab(homeTab);
      setTopBarFocusSignal((n) => n + 1);
      return;
    }
    if (isExitArmedRef.current) {
      disarmExit();
      BackHandler.exitApp();
      return;
    }
    isExitArmedRef.current = true;
    exitTimerRef.current = setTimeout(disarmExit, EXIT_CONFIRM_MS);
    // The system toast, like other Android TV apps' exit hint (it can't be dismissed early).
    if (Platform.OS === 'android') {
      ToastAndroid.show(t('app.exitHint'), ToastAndroid.SHORT);
    }
  });
  useEffect(() => {
    if (upgradeRequest) selectTab('settings');
  }, [upgradeRequest, selectTab]);
  useSmartTvAutoplay(speaker);
  const [isSearching, setIsSearching] = useState(true);
  const [deviceVolume, setDeviceVolume] = useState<number | undefined>(undefined);
  const [nowPlaying, setNowPlaying] = useState<{ title?: string; artist?: string; albumArtUri?: string; isPlaying: boolean }>({
    isPlaying: false,
  });

  const scanSpeakers = useCallback(async () => {
    setIsSearching(true);
    try {
      roomPrefsLoadRef.current ??= RoomPreferencesStore.load().then((loaded) => {
        roomPrefsRef.current = loaded;
        setRoomPrefs(loaded);
      });
      const [all] = await Promise.all([
        SonosDiscoveryService.findAllSpeakers(),
        roomPrefsLoadRef.current,
      ]);

      if (all.length > 0) {
        setSpeakers(all);
        // The fresh entry, so room name and bonded-speaker info stay current. Later
        // scans keep the room in use; the first one opens on the last room picked.
        setSpeaker((prev) => pickRoom(all, roomPrefsRef.current, prev?.id));
      } else {
        setSpeakers([]);
        setSpeaker(null);
      }
    } catch {
      setSpeakers([]);
      setSpeaker(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    scanSpeakers();
  }, [scanSpeakers]);

  const selectSpeaker = useCallback((device: SonosDevice) => {
    setSpeaker(device);
    updateRoomPrefs((prefs) => ({ ...prefs, lastRoomId: device.id }));
  }, [updateRoomPrefs]);

  const handleToggleRoomHidden = useCallback((device: SonosDevice) => {
    const hiddenRoomIds = toggleRoomHidden(device, roomPrefsRef.current.hiddenRoomIds);
    updateRoomPrefs((prefs) => ({ ...prefs, hiddenRoomIds }));
    // Hiding the room in use moves playback control to the first room still shown.
    if (speaker && device.id === speaker.id) {
      const next = partitionRooms(speakers, hiddenRoomIds).visible.find((d) => d.id !== device.id);
      if (next) selectSpeaker(next);
    }
  }, [speaker, speakers, selectSpeaker, updateRoomPrefs]);

  useEffect(() => {
    if (!speaker) {
      setNowPlaying({ isPlaying: false });
      setDeviceVolume(undefined);
      return;
    }
    let isMounted = true;
    const fetchNowPlaying = async () => {
      try {
        const [posInfo, transportInfo, volume] = await Promise.all([
          SonosUpnpClient.getPositionInfo(speaker.ip),
          SonosUpnpClient.getTransportInfo(speaker.ip),
          SonosUpnpClient.getVolume(speaker.ip).catch(() => undefined),
        ]);
        if (!isMounted) return;
        if (volume !== undefined) setDeviceVolume(volume);
        setNowPlaying({
          title: posInfo?.metadata?.title,
          artist: posInfo?.metadata?.artist,
          albumArtUri: posInfo?.metadata?.albumArtUri,
          isPlaying: transportInfo?.state === 'PLAYING',
        });
      } catch {
        // Non-blocking — TopBar just keeps showing the last known state.
      }
    };
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, NOW_PLAYING_POLL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [speaker]);

  // The room name ("Living Room") is what users recognise; the model is a fallback.
  const getDisplaySpeakerName = (dev: SonosDevice | null): string => {
    if (!dev) return '';
    const name = (dev.name || '')
      .replace(/^(\d{1,3}\.){3}\d{1,3}\s*[-–:]\s*/i, '')
      .replace(/\s*[-–:]\s*RINCON_[A-Z0-9]+.*$/i, '')
      .replace(/RINCON_[A-Z0-9]+/i, '')
      .replace(/\s*Media (Server|Renderer)\s*/i, ' ')
      .replace(/^Sonos\s*[-–:]\s*/i, '')
      .trim();
    return name || dev.modelName?.trim() || t('common.speaker');
  };

  const deviceLabel = speaker
    ? getDisplaySpeakerName(speaker)
    : isSearching
    ? t('app.status.searching')
    : t('app.status.notConnected');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar hidden />
      <TopBar
        activeTab={activeTab}
        onSelectTab={selectTab}
        miniPlayerTitle={nowPlaying.title || t('app.status.audio')}
        miniPlayerArtist={nowPlaying.artist || (speaker ? getDisplaySpeakerName(speaker) : t('app.status.standby'))}
        miniPlayerArtworkUri={nowPlaying.albumArtUri}
        isPlaying={nowPlaying.isPlaying}
        deviceName={deviceLabel}
        deviceVolume={deviceVolume}
        onPressDevice={() => selectTab('system')}
        showSettingsBadge={hasUnreadAnnouncements || updateInfo?.status === 'optional_update'}
        focusActiveSignal={topBarFocusSignal}
        onFocusWithinChange={handleTopBarFocusWithin}
      />
      <View style={styles.content}>
        {renderTab('home', renderProTab('home',
          (speaker ? (
            <HomeScreen speakerIp={speaker.ip} speakerId={speaker.id} isActive={activeTab === 'home'} />
          ) : (
            <View style={styles.emptyStateContainer} testID="no-speaker-screen">
              <Text style={[styles.emptyTitle, isSearching && styles.emptyTitleSearching]}>
                {isSearching ? t('app.discovery.searching') : t('app.discovery.notFound')}
              </Text>
              {!isSearching && (
                <Text style={styles.emptySubtitle}>{t('app.discovery.notFoundHint')}</Text>
              )}
              <TVPillButton
                hasTVPreferredFocus
                label={isSearching ? t('app.discovery.scanning') : t('app.discovery.searchAgain')}
                disabled={isSearching}
                onPress={scanSpeakers}
              />
            </View>
          ))))}
        {activeTab === 'nowPlaying' &&
          (speaker ? (
            <NowPlayingScreen
              speakerIp={speaker.ip}
              speakerId={speaker.id}
              initialState="STOPPED"
              autoFetch={true}
              pollIntervalMs={2500}
            />
          ) : (
            <View style={styles.emptyStateContainer} testID="no-speaker-screen">
              <Text style={[styles.emptyTitle, isSearching && styles.emptyTitleSearching]}>
                {isSearching ? t('app.discovery.searching') : t('app.discovery.notFound')}
              </Text>
              {!isSearching && (
                <Text style={styles.emptySubtitle}>{t('app.discovery.notFoundHint')}</Text>
              )}
              <TVPillButton
                hasTVPreferredFocus
                label={isSearching ? t('app.discovery.scanning') : t('app.discovery.searchAgain')}
                disabled={isSearching}
                onPress={scanSpeakers}
              />
            </View>
          ))}
        {renderTab('search', renderProTab('search',
          (speaker ? (
            <SearchScreen speakerIp={speaker.ip} speakerId={speaker.id} isActive={activeTab === 'search'} />
          ) : (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyTitle}>{t('common.speakerRequired')}</Text>
              <Text style={styles.emptySubtitle}>{t('app.speakerRequired.search')}</Text>
            </View>
          ))))}
        {renderTab('favorites', renderProTab('favorites',
          (speaker ? (
            <FavoritesScreen speakerIp={speaker.ip} speakerId={speaker.id} />
          ) : (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyTitle}>{t('common.speakerRequired')}</Text>
              <Text style={styles.emptySubtitle}>{t('app.speakerRequired.favorites')}</Text>
            </View>
          ))))}
        {/* Notifications, Update and About work without a speaker; the Sound pane shows its own empty state. */}
        {renderTab('settings', <SettingsScreen speaker={speaker} upgradeRequest={upgradeRequest} isActive={activeTab === 'settings'} />)}
        {activeTab === 'system' && (
          <SystemScreen
            speaker={speaker}
            speakers={speakers}
            onSelectSpeaker={selectSpeaker}
            hiddenRoomIds={roomPrefs.hiddenRoomIds}
            onToggleRoomHidden={handleToggleRoomHidden}
            onRescanNetwork={scanSpeakers}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/** Blocks the whole app (discovery and polling included) while a force update is pending. */
function AppGate() {
  const { updateInfo } = useRemoteConfig();
  if (updateInfo?.status === 'force_update') {
    return <ForceUpdateScreen updateInfo={updateInfo} />;
  }
  return <AppContent />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <RemoteConfigProvider>
            <ToastProvider>
              <ProProvider>
                <AppGate />
              </ProProvider>
            </ToastProvider>
          </RemoteConfigProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  tabPane: {
    flex: 1,
  },
  tabHidden: {
    display: 'none',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyTitleSearching: {
    marginBottom: 24,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 480,
    lineHeight: 22,
    marginBottom: 20,
  },
});
