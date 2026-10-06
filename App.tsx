import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, StatusBar, View, Text } from 'react-native';
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

const NOW_PLAYING_POLL_MS = 5000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
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
        onSelectTab={setActiveTab}
        miniPlayerTitle={nowPlaying.title || 'Audio'}
        miniPlayerArtist={nowPlaying.artist || (speaker ? getDisplaySpeakerName(speaker) : 'Standby')}
        miniPlayerArtworkUri={nowPlaying.albumArtUri}
        isPlaying={nowPlaying.isPlaying}
        deviceName={deviceLabel}
        deviceVolume={deviceVolume}
        onPressDevice={() => setActiveTab('system')}
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
        {renderTab('settings',
          (speaker ? (
            <SettingsScreen speaker={speaker} />
          ) : (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyTitle}>Speaker Required</Text>
              <Text style={styles.emptySubtitle}>
                Connect to a Sonos speaker to configure audio and sound settings.
              </Text>
            </View>
          )))}
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

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />
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
