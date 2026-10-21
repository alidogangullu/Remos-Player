import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, StatusBar, View, Text, BackHandler, Platform, ToastAndroid } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
import { TVPillButton } from './src/components/tv';
import { ToastProvider } from './src/components/common';
import { useBackHandler } from './src/hooks';
import { RemoteConfigProvider, useRemoteConfig } from './src/services/remoteConfig/RemoteConfigProvider';
import { ForceUpdateScreen } from './src/features/update/ForceUpdateScreen';

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
  const { updateInfo, hasUnreadAnnouncements } = useRemoteConfig();
  const [activeTab, setActiveTab] = useState<TopBarTab>('home');
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
    if (activeTab !== 'home') {
      selectTab('home');
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
      ToastAndroid.show('Press Back again to exit', ToastAndroid.SHORT);
    }
  });
  useSmartTvAutoplay(speaker);
  const [isSearching, setIsSearching] = useState(true);
  const [deviceVolume, setDeviceVolume] = useState<number | undefined>(undefined);
  const [nowPlaying, setNowPlaying] = useState<{ title?: string; artist?: string; albumArtUri?: string; isPlaying: boolean }>({
    isPlaying: false,
  });

  const scanSpeakers = useCallback(async () => {
    setIsSearching(true);
    try {
      const all = await SonosDiscoveryService.findAllSpeakers();

      if (all.length > 0) {
        setSpeakers(all);
        setSpeaker(prev => {
          // Take the fresh entry so room name and bonded-speaker info stay current.
          const same = prev && all.find(s => s.id === prev.id);
          return same || all[0];
        });
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
    return name || dev.modelName?.trim() || 'Sonos Speaker';
  };

  const deviceLabel = speaker
    ? getDisplaySpeakerName(speaker)
    : isSearching
    ? 'Searching...'
    : 'Not Connected';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar hidden />
      <TopBar
        activeTab={activeTab}
        onSelectTab={selectTab}
        miniPlayerTitle={nowPlaying.title || 'Audio'}
        miniPlayerArtist={nowPlaying.artist || (speaker ? getDisplaySpeakerName(speaker) : 'Standby')}
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
        {renderTab('home',
          (speaker ? (
            <HomeScreen speakerIp={speaker.ip} speakerId={speaker.id} isActive={activeTab === 'home'} />
          ) : (
            <View style={styles.emptyStateContainer} testID="no-speaker-screen">
              <Text style={[styles.emptyTitle, isSearching && styles.emptyTitleSearching]}>
                {isSearching
                  ? 'Searching for Sonos Speakers...'
                  : 'No Sonos Speakers Found'}
              </Text>
              {!isSearching && (
                <Text style={styles.emptySubtitle}>
                  Ensure your Sonos speaker is powered on and connected to the same Wi-Fi network.
                </Text>
              )}
              <TVPillButton
                hasTVPreferredFocus
                label={isSearching ? 'Scanning...' : 'Search Again'}
                disabled={isSearching}
                onPress={scanSpeakers}
              />
            </View>
          )))}
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
                {isSearching
                  ? 'Searching for Sonos Speakers...'
                  : 'No Sonos Speakers Found'}
              </Text>
              {!isSearching && (
                <Text style={styles.emptySubtitle}>
                  Ensure your Sonos speaker is powered on and connected to the same Wi-Fi network.
                </Text>
              )}
              <TVPillButton
                hasTVPreferredFocus
                label={isSearching ? 'Scanning...' : 'Search Again'}
                disabled={isSearching}
                onPress={scanSpeakers}
              />
            </View>
          ))}
        {renderTab('search',
          (speaker ? (
            <SearchScreen speakerIp={speaker.ip} speakerId={speaker.id} isActive={activeTab === 'search'} />
          ) : (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyTitle}>Speaker Required</Text>
              <Text style={styles.emptySubtitle}>
                Connect to a Sonos speaker to search your music services.
              </Text>
            </View>
          )))}
        {renderTab('favorites',
          (speaker ? (
            <FavoritesScreen speakerIp={speaker.ip} speakerId={speaker.id} />
          ) : (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyTitle}>Speaker Required</Text>
              <Text style={styles.emptySubtitle}>
                Connect to a Sonos speaker to access your favorites.
              </Text>
            </View>
          )))}
        {/* Notifications, Update and About work without a speaker; the Sound pane shows its own empty state. */}
        {renderTab('settings', <SettingsScreen speaker={speaker} />)}
        {activeTab === 'system' && (
          <SystemScreen
            speaker={speaker}
            speakers={speakers}
            onSelectSpeaker={setSpeaker}
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
        <RemoteConfigProvider>
          <ToastProvider>
            <AppGate />
          </ToastProvider>
        </RemoteConfigProvider>
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
