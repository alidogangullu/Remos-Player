import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useTVEventHandler,
} from 'react-native';
import { colors, spacing } from '../../theme';

const SEEK_STEP_MS = 5000;

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface NowPlayingProgressBarProps {
  positionMs: number;
  durationMs: number;
  onSeekTo?: (ms: number) => void;
  playbackControlsNode?: number | null;
  progressBarRef?: React.RefObject<View | null>;
  onLayoutProgress?: () => void;
  /** Keeps the bar's space (so the artwork doesn't move) but shows nothing and takes no focus — for live radio. */
  hidden?: boolean;
}

export const NowPlayingProgressBar: React.FC<NowPlayingProgressBarProps> = React.memo(({
  positionMs,
  durationMs,
  onSeekTo,
  playbackControlsNode,
  progressBarRef: externalProgressBarRef,
  onLayoutProgress,
  hidden = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [pendingSeekMs, setPendingSeekMs] = useState(0);

  const fillOpacity = useRef(new Animated.Value(0)).current;
  const isFocusedRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const positionRef = useRef(positionMs);
  const durationRef = useRef(durationMs);
  const pendingSeekMsRef = useRef(0);

  isFocusedRef.current = isFocused;
  isScrubbingRef.current = isScrubbing;
  positionRef.current = positionMs;
  durationRef.current = durationMs;
  pendingSeekMsRef.current = pendingSeekMs;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    Animated.timing(fillOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fillOpacity]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setIsScrubbing(false);
    setPendingSeekMs(0);
    Animated.timing(fillOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }, [fillOpacity]);

  const handlePress = useCallback(() => {
    if (isScrubbingRef.current && onSeekTo) {
      onSeekTo(pendingSeekMsRef.current);
      setIsScrubbing(false);
      setPendingSeekMs(0);
    }
  }, [onSeekTo]);

  // TV remote D-pad scrubbing left/right
  useTVEventHandler?.((evt: { eventType: string }) => {
    if (!isFocusedRef.current) return;
    if (evt.eventType !== 'left' && evt.eventType !== 'right') return;
    const base = isScrubbingRef.current ? pendingSeekMsRef.current : positionRef.current;
    const delta = evt.eventType === 'right' ? SEEK_STEP_MS : -SEEK_STEP_MS;
    const next = Math.max(0, Math.min(durationRef.current, base + delta));
    setPendingSeekMs(next);
    setIsScrubbing(true);
  });

  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const remainingMs = durationMs > 0 ? Math.max(0, durationMs - positionMs) : 0;
  const scrubProgress = durationMs > 0 ? Math.min(1, Math.max(0, pendingSeekMs / durationMs)) : 0;

  const internalProgressBarRef = useRef<View>(null);
  const progressBarRef = externalProgressBarRef ?? internalProgressBarRef;

  return (
    <View
      style={[styles.container, hidden && styles.hidden]}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {/* Focusable Interactive Progress Track */}
      <Pressable
        ref={progressBarRef as any}
        onLayout={onLayoutProgress}
        style={styles.progressContainer}
        nextFocusUp={playbackControlsNode ?? undefined}
        focusable={!hidden}
        disabled={hidden}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPress={handlePress}
        accessibilityLabel="Playback progress"
        accessibilityRole="adjustable"
      >
        {({ focused }) => (
          <View style={[styles.progressTrack, focused && styles.progressTrackFocused]}>
            <View style={[StyleSheet.absoluteFill, styles.progressClip]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: `${(isScrubbing ? scrubProgress : progress) * 100}%`,
                  },
                ]}
              />
            </View>
            <View
              style={[
                styles.progressKnob,
                { left: `${(isScrubbing ? scrubProgress : progress) * 100}%` as any },
                focused && styles.progressKnobFocused,
              ]}
            />
          </View>
        )}
      </Pressable>

      {/* Time Display Row */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>
          {isScrubbing ? formatTime(pendingSeekMs) : formatTime(positionMs)}
        </Text>
        <Text style={[styles.timeText, isScrubbing && styles.timeTextScrubbing]}>
          {isScrubbing ? formatTime(pendingSeekMs) : `-${formatTime(remainingMs)}`}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 0,
  },
  hidden: {
    opacity: 0,
  },
  progressContainer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    overflow: 'visible',
  },
  progressTrackFocused: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  progressClip: {
    overflow: 'hidden',
    borderRadius: 3,
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  progressKnob: {
    position: 'absolute',
    width: 2,
    height: 6,
    marginLeft: -1,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  progressKnobFocused: {
    width: 4,
    height: 10,
    top: -2,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  timeText: {
    fontSize: 13,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  timeTextScrubbing: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
