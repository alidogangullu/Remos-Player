import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  findNodeHandle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { useArtworkColors, backgroundGradient } from './useArtworkColors';
import { colors, spacing } from '../../theme';
import { NowPlayingTrackInfo, ARTWORK_SIZE } from './NowPlayingTrackInfo';
import { PlaybackControls } from './PlaybackControls';
import { NowPlayingProgressBar } from './NowPlayingProgressBar';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';
import { LyricLine } from '../../services/lyrics/lrcParser';
import { fetchLyrics } from '../../services/lyrics/lyricsService';
import { TrackMetadata, PlaybackState } from '../../types/sonos';
import {
  SonosUpnpClient,
  QueueItem,
  describeTrackQuality,
  isRadioStreamUri,
} from '../../services/sonos/upnp/sonosUpnpClient';
import { PlaybackHistoryService } from '../../services/history/playbackHistoryService';
import { TVVolumePanel } from '../../components/tv';

export interface NowPlayingTrack extends TrackMetadata {
  format?: string;
}

/** The speaker reports RelTime in whole seconds. */
const POSITION_PRECISION_MS = 1000;
/** A reading further than this from our estimate is a seek or real drift, not rounding. */
const POSITION_RESYNC_MS = 2000;

export interface NowPlayingScreenProps {
  speakerIp: string;
  speakerId?: string;
  initialTrack?: NowPlayingTrack;
  initialState?: PlaybackState;
  initialShuffle?: boolean;
  initialRepeat?: boolean;
  onToggleShuffle?: (shuffle: boolean) => void;
  onToggleRepeat?: (repeat: boolean) => void;
  autoFetch?: boolean;
  pollIntervalMs?: number;
  interpolateProgress?: boolean;
}

const FAVORITES_STORAGE_KEY = 'SONOS_TV_LOCAL_FAVORITES';

export const NowPlayingScreen: React.FC<NowPlayingScreenProps> = ({
  speakerIp,
  speakerId,
  initialTrack,
  initialState = 'STOPPED',
  initialShuffle = false,
  initialRepeat = false,
  onToggleShuffle,
  onToggleRepeat,
  autoFetch = false,
  pollIntervalMs = 0,
  interpolateProgress = true,
}) => {
  const [track, setTrack] = useState<NowPlayingTrack | undefined>(initialTrack);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(initialState);
  const [isShuffle, setIsShuffle] = useState(initialShuffle);
  const [isRepeat, setIsRepeat] = useState(initialRepeat);
  const [displayPositionMs, setDisplayPositionMs] = useState<number>(initialTrack?.positionMs || 0);
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch && !initialTrack);

  // AirTune feature states: Lyrics, Queue, Favorite, Toast
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  const [showQueue, setShowQueue] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);

  const [isFavorite, setIsFavorite] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scale animation for artwork on track change (AirTune signature)
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.94,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [track?.title, scaleAnim]);

  const [showVolume, setShowVolume] = useState(false);
  const [initialVolume, setInitialVolume] = useState<number | null>(null);
  const [volumeFocusSignal, setVolumeFocusSignal] = useState(0);
  // Coalesces rapid ↑/↓ presses: at most one SetVolume in flight, then the latest value.
  const volumeWriteRef = useRef<{ inFlight: boolean; pending: number | null }>({ inFlight: false, pending: null });

  const handleOpenVolume = useCallback(() => {
    setInitialVolume(null);
    setShowVolume(true);
    SonosUpnpClient.getVolume(speakerIp)
      .then(setInitialVolume)
      .catch(() => setInitialVolume(0));
  }, [speakerIp]);

  const handleCloseVolume = useCallback(() => {
    setVolumeFocusSignal((n) => n + 1);
    setShowVolume(false);
  }, []);

  const handleChangeVolume = useCallback(async (volume: number) => {
    const writer = volumeWriteRef.current;
    writer.pending = volume;
    if (writer.inFlight) return;
    writer.inFlight = true;
    while (writer.pending !== null) {
      const next = writer.pending;
      writer.pending = null;
      try {
        await SonosUpnpClient.setVolume(speakerIp, next);
      } catch {
        // Next press retries with the latest value.
      }
    }
    writer.inFlight = false;
  }, [speakerIp]);

  // Node handles for focus navigation (AirTune focus management)
  const progressBarRef = useRef<View>(null);
  const playbackControlsRef = useRef<View>(null);
  const [progressBarNode, setProgressBarNode] = useState<number | null>(null);

  const anchorRef = useRef<{
    positionMs: number;
    timestamp: number;
    trackKey: string;
  }>({
    positionMs: initialTrack?.positionMs || 0,
    timestamp: Date.now(),
    trackKey: initialTrack?.uri || initialTrack?.title || '',
  });

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Check if current track is in saved favorites
  useEffect(() => {
    let isMounted = true;
    async function checkFavorite() {
      if (!track?.title) return;
      try {
        const stored = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
        if (stored && isMounted) {
          const list = JSON.parse(stored);
          const found =
            Array.isArray(list) &&
            list.some(
              (item: any) =>
                (item.title && item.title.toLowerCase() === track.title.toLowerCase()) ||
                (item.uri && track.uri && item.uri === track.uri)
            );
          setIsFavorite(found);
        }
      } catch {
        // Ignore storage error
      }
    }
    checkFavorite();
    return () => {
      isMounted = false;
    };
  }, [track?.title, track?.uri]);

  // Fetch lyrics when lyrics mode is enabled or track changes
  useEffect(() => {
    if (!showLyrics || !track?.title || !track?.artist) return;
    let isMounted = true;
    setIsLoadingLyrics(true);

    fetchLyrics(track.title, track.artist, track.album, track.durationMs)
      .then((res) => {
        if (isMounted) {
          setLyrics(res?.lines || []);
        }
      })
      .catch(() => {
        if (isMounted) setLyrics([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingLyrics(false);
      });

    return () => {
      isMounted = false;
    };
  }, [showLyrics, track?.title, track?.artist, track?.album, track?.durationMs]);

  // Fetch Sonos queue when queue view is opened
  useEffect(() => {
    if (!showQueue || !speakerIp) return;
    let isMounted = true;
    setIsLoadingQueue(true);

    SonosUpnpClient.getQueue(speakerIp)
      .then((q) => {
        if (isMounted) {
          setQueue(q);
        }
      })
      .catch(() => {
        if (isMounted) setQueue([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingQueue(false);
      });

    return () => {
      isMounted = false;
    };
  }, [showQueue, speakerIp]);

  const fetchLiveStatus = useCallback(async () => {
    if (!speakerIp) return;
    try {
      // When the speaker read its position: midway through the request, not
      // after the slower quality lookup that resolves alongside it.
      const requestStart = Date.now();
      let sampledAt = requestStart;
      const [posInfo, transportInfo, quality] = await Promise.all([
        SonosUpnpClient.getPositionInfo(speakerIp).then((info) => {
          sampledAt = (requestStart + Date.now()) / 2;
          return info;
        }),
        SonosUpnpClient.getTransportInfo(speakerIp),
        SonosUpnpClient.getTrackQuality(speakerIp).catch(() => null),
      ]);
      if (posInfo?.metadata) {
        const isTvAudio = posInfo.trackUri.includes('x-sonos-htastream');
        const qualityLabel = isTvAudio
          ? await SonosUpnpClient.getTvAudioFormat(speakerIp).catch(() => null)
          : describeTrackQuality(quality);
        // Real quality from the speaker wins over the service-name fallback.
        const newTrack = qualityLabel
          ? { ...posInfo.metadata, format: qualityLabel }
          : posInfo.metadata;
        const newKey = newTrack.uri || newTrack.title || '';
        const isNewTrack = newKey !== anchorRef.current.trackKey;

        setTrack(newTrack);

        const isPlayingNow = transportInfo?.state === 'PLAYING';
        // RelTime has whole-second precision: "1:46" means somewhere in [1:46.000, 1:47.000).
        const reportedMs = newTrack.positionMs || 0;

        if (isNewTrack) {
          // Start mid-second; later polls narrow it down (see below).
          const startMs = reportedMs + (isPlayingNow ? POSITION_PRECISION_MS / 2 : 0);
          anchorRef.current = {
            positionMs: startMs,
            timestamp: sampledAt,
            trackKey: newKey,
          };
          setDisplayPositionMs(startMs);

          // Record into local playback history. Radio is skipped: the station
          // was already saved, with a replayable URI, by whatever started it —
          // here its URI is the raw stream and its details change per show.
          if (newTrack.title && !isRadioStreamUri(newTrack.uri ?? '')) {
            PlaybackHistoryService.addTrack({
              title: newTrack.title,
              artist: newTrack.artist,
              album: newTrack.album,
              albumArtUri: newTrack.albumArtUri,
              uri: newTrack.uri,
            });
          }
        } else {
          // Where our own clock says playback was when the speaker sampled it.
          const elapsedLocal = Math.max(0, sampledAt - anchorRef.current.timestamp);
          const estimateMs = anchorRef.current.positionMs + (isPlayingNow ? elapsedLocal : 0);
          const intervalEndMs = reportedMs + POSITION_PRECISION_MS;

          let correctedMs: number | null = null;
          if (Math.abs(estimateMs - reportedMs) > POSITION_RESYNC_MS) {
            correctedMs = reportedMs; // seek, skip or real drift: jump straight there
          } else if (estimateMs < reportedMs) {
            correctedMs = reportedMs; // we're behind the reading: catch up to its start
          } else if (estimateMs >= intervalEndMs) {
            correctedMs = intervalEndMs - 1; // ahead of the reading: ease back to its end
          }
          // Otherwise the estimate agrees with the reading: leave it alone, so the
          // shown position (and the lyric line) never steps backward on a poll.

          if (correctedMs !== null) {
            anchorRef.current = {
              positionMs: correctedMs,
              timestamp: sampledAt,
              trackKey: newKey,
            };
            // The ticker only runs while playing; when paused, show the correction directly.
            if (!isPlayingNow || Math.abs(estimateMs - reportedMs) > POSITION_RESYNC_MS) {
              setDisplayPositionMs(correctedMs);
            }
          }
        }
      }
      if (transportInfo?.state) {
        setPlaybackState(transportInfo.state as PlaybackState);
      }
    } catch {
      // Non-blocking error handling
    } finally {
      setIsLoading(false);
    }
  }, [speakerIp]);

  useEffect(() => {
    if (!autoFetch) return;
    fetchLiveStatus();
    if (!pollIntervalMs || pollIntervalMs <= 0) return;
    const interval = setInterval(fetchLiveStatus, pollIntervalMs);
    return () => clearInterval(interval);
  }, [autoFetch, fetchLiveStatus, pollIntervalMs]);

  const isTvAudio = Boolean(track?.uri && track.uri.includes('x-sonos-htastream'));
  // Live radio: no position, no previous/next, and nothing to shuffle, repeat, sync lyrics to or queue.
  const isRadio = Boolean(track?.uri && isRadioStreamUri(track.uri));

  // Same palette picks as AirTune's Now Playing background.
  const palette = useArtworkColors(isTvAudio ? null : track?.albumArtUri);
  const gradient = palette ? backgroundGradient(palette) : null;
  const bgFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bgFade, { toValue: gradient ? 1 : 0, duration: 600, useNativeDriver: true }).start();
  }, [gradient, bgFade]);
  const isPlaying = playbackState === 'PLAYING';

  // Smooth local ticker that advances progress smoothly every 250ms
  useEffect(() => {
    if (!isPlaying || isTvAudio || !interpolateProgress || !autoFetch) return;

    const ticker = setInterval(() => {
      const elapsed = Date.now() - anchorRef.current.timestamp;
      const current = Math.min(
        track?.durationMs || Infinity,
        anchorRef.current.positionMs + elapsed
      );
      setDisplayPositionMs(current);
    }, 250);

    return () => clearInterval(ticker);
  }, [isPlaying, isTvAudio, interpolateProgress, autoFetch, track?.durationMs]);

  const handleTogglePlay = async () => {
    try {
      if (isPlaying) {
        await SonosUpnpClient.pause(speakerIp);
        setPlaybackState('PAUSED_PLAYBACK');
        anchorRef.current = {
          positionMs: displayPositionMs,
          timestamp: Date.now(),
          trackKey: anchorRef.current.trackKey,
        };
      } else {
        await SonosUpnpClient.play(speakerIp);
        setPlaybackState('PLAYING');
        anchorRef.current = {
          positionMs: displayPositionMs,
          timestamp: Date.now(),
          trackKey: anchorRef.current.trackKey,
        };
      }
    } catch {
      // Non-blocking error handling
    }
  };

  const handleNext = async () => {
    try {
      await SonosUpnpClient.next(speakerIp);
    } catch {
      // Ignored
    }
  };

  const handlePrevious = async () => {
    try {
      await SonosUpnpClient.previous(speakerIp);
    } catch {
      // Ignored
    }
  };

  const handleToggleShuffle = () => {
    const nextState = !isShuffle;
    setIsShuffle(nextState);
    onToggleShuffle?.(nextState);
  };

  const handleToggleRepeat = () => {
    const nextState = !isRepeat;
    setIsRepeat(nextState);
    onToggleRepeat?.(nextState);
  };

  const handleToggleLyrics = () => {
    const next = !showLyrics;
    setShowLyrics(next);
    if (next) setShowQueue(false);
  };

  const handleToggleQueue = () => {
    const next = !showQueue;
    setShowQueue(next);
    if (next) setShowLyrics(false);
  };

  const handleSelectQueueItem = async (queueItem: QueueItem) => {
    try {
      showToast(`Jumping to #${queueItem.trackNumber} ${queueItem.title}`);
      await SonosUpnpClient.seekTrack(speakerIp, queueItem.trackNumber, speakerId);
      setShowQueue(false);
      setTimeout(fetchLiveStatus, 500);
    } catch {
      showToast('Failed to play queue track');
    }
  };

  const handleToggleFavorite = async () => {
    if (!track?.title) return;
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      let list: any[] = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];

      const existsIndex = list.findIndex(
        (item: any) =>
          (item.title && item.title.toLowerCase() === track.title.toLowerCase()) ||
          (item.uri && track.uri && item.uri === track.uri)
      );

      if (existsIndex >= 0) {
        list.splice(existsIndex, 1);
        setIsFavorite(false);
        showToast(`Removed "${track.title}" from favorites`);
      } else {
        list.push({
          id: track.uri || `fav-${Date.now()}`,
          title: track.title,
          type: 'track',
          subtitle: track.artist,
          albumArtUri: track.albumArtUri,
          uri: track.uri,
        });
        setIsFavorite(true);
        showToast(`Added "${track.title}" to favorites`);
      }
      await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
    } catch {
      showToast('Could not update favorites');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer} testID="now-playing-loading">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Determine Center Content (AirTune Architecture: Artwork OR Split Lyrics OR Integrated Queue)
  let centerContent: React.ReactNode;
  if (showLyrics && !isRadio) {
    centerContent = (
      <View style={styles.lyricsSplitView}>
        <View style={styles.artworkSectionSide}>
          <NowPlayingTrackInfo
            track={track}
            scaleAnim={scaleAnim}
            align="center"
            isTvAudio={isTvAudio}
          />
        </View>
        <View style={styles.lyricsSection}>
          <LyricsView
            lyrics={lyrics}
            currentPositionMs={displayPositionMs}
            isLoading={isLoadingLyrics}
          />
        </View>
      </View>
    );
  } else if (showQueue && !isRadio && queue.length > 0) {
    centerContent = (
      <View style={styles.integratedQueueContainer}>
        <QueueView
          queue={queue}
          currentTrackUri={track?.uri}
          currentTrackTitle={track?.title}
          isLoading={isLoadingQueue}
          onSelectTrack={handleSelectQueueItem}
        />
      </View>
    );
  } else {
    centerContent = (
      <NowPlayingTrackInfo
        track={track}
        scaleAnim={scaleAnim}
        align="center"
        isTvAudio={isTvAudio}
        isLive={isRadio}
      />
    );
  }

  return (
    <View style={styles.root}>
      {gradient && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: bgFade }]} pointerEvents="none">
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      {/* Toast Feedback Overlay */}
      {toastMessage && (
        <View style={styles.toast} testID="now-playing-toast">
          <View style={styles.toastIndicator} />
          <Text style={styles.toastText} numberOfLines={1}>
            {toastMessage}
          </Text>
        </View>
      )}

      {/* Centered Content: Artwork, Split Lyrics, or Integrated Queue (AirTune layout) */}
      <View style={styles.content}>{centerContent}</View>

      {/* Fixed Bottom Controls & Interactive Progress Bar Footer (AirTune layout) */}
      <View style={styles.footerContainer}>
        {/* Soft scrim instead of a solid band, so the artwork gradient runs edge to edge. */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.35)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          ref={playbackControlsRef}
          // Radio hides the progress bar below; drop the controls into most of
          // its space instead of leaving them floating mid-screen.
          style={isRadio && styles.controlsRadio}
          onLayout={() => {
            /* focus tracking */
          }}
        >
          <PlaybackControls
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onNext={isRadio ? undefined : handleNext}
            onPrevious={isRadio ? undefined : handlePrevious}
            isShuffle={isShuffle}
            onToggleShuffle={isRadio ? undefined : handleToggleShuffle}
            isRepeat={isRepeat}
            onToggleRepeat={isRadio ? undefined : handleToggleRepeat}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            showLyrics={showLyrics}
            onToggleLyrics={!isTvAudio && !isRadio ? handleToggleLyrics : undefined}
            showQueue={showQueue}
            onToggleQueue={!isTvAudio && !isRadio ? handleToggleQueue : undefined}
            showVolume={showVolume}
            onOpenVolume={handleOpenVolume}
            volumeFocusSignal={volumeFocusSignal}
            nextFocusDown={isRadio ? undefined : progressBarNode}
          />
        </View>

        {/* A live stream has no length or position: the bar keeps its space but stays hidden. */}
        <NowPlayingProgressBar
          positionMs={displayPositionMs}
          durationMs={track?.durationMs || 0}
          progressBarRef={progressBarRef}
          onLayoutProgress={() => setProgressBarNode(findNodeHandle(progressBarRef.current))}
          hidden={isRadio}
        />
      </View>

      {showVolume && (
        <TVVolumePanel
          initialVolume={initialVolume}
          onChangeVolume={handleChangeVolume}
          onClose={handleCloseVolume}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08080A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#08080A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingBottom: 80,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.sm,
  },
  controlsRadio: {
    // Moved with a transform (not layout) so the footer, and the artwork above it, don't shift.
    transform: [{ translateY: 28 }],
  },
  /* Toast Notification */
  toast: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.screenPaddingHorizontal,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.statusPlaying,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  toastIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.statusPlaying,
  },
  toastText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  /* Split Lyrics View (AirTune style) */
  lyricsSplitView: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
  },
  artworkSectionSide: {
    flex: 0.45,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 32,
    paddingRight: 32,
  },
  lyricsSection: {
    flex: 0.55,
    // Extends up under the TopBar; bottom stops above the playback controls.
    marginTop: -44,
    marginBottom: 8,
    paddingLeft: 32,
    paddingRight: 80,
  },
  /* Integrated Queue View (AirTune style) */
  integratedQueueContainer: {
    width: '100%',
    height: ARTWORK_SIZE + 100,
    justifyContent: 'center',
  },
  queueHeaderRow: {
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xs,
  },
  queueHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  queueHeaderSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
});
