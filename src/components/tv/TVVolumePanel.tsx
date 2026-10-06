import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  TVEventControl,
  Text,
  View,
  findNodeHandle,
  useTVEventHandler,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const STEP = 2;
const AUTO_CLOSE_MS = 5000;
const TRACK_HEIGHT = 120;

export interface TVVolumePanelProps {
  /** Starting level (0–100); `null` while it is still being read from the device. */
  initialVolume: number | null;
  onChangeVolume: (volume: number) => void;
  onClose: () => void;
}

/**
 * Vertical volume sheet for D-pad remotes: ↑/↓ adjusts, OK/Back closes,
 * and it auto-dismisses after a few idle seconds. Focus is trapped on the
 * panel while open so ↑/↓ never move focus to the controls behind it.
 */
export function TVVolumePanel({
  initialVolume,
  onChangeVolume,
  onClose,
}: Readonly<TVVolumePanelProps>) {
  const [volume, setVolume] = useState<number | null>(initialVolume);
  const [selfNode, setSelfNode] = useState<number | null>(null);
  const panelRef = useRef<View | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (volumeRef.current === null && initialVolume !== null)
      setVolume(initialVolume);
  }, [initialVolume]);

  const armAutoClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(onClose, AUTO_CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    armAutoClose();
    TVEventControl?.enableTVMenuKey?.();
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      TVEventControl?.disableTVMenuKey?.();
      backSub.remove();
    };
  }, [appear, armAutoClose, onClose]);

  useTVEventHandler((evt: { eventType: string }) => {
    if (evt.eventType !== 'up' && evt.eventType !== 'down') return;
    const current = volumeRef.current;
    if (current === null) return;
    const next = Math.max(
      0,
      Math.min(100, current + (evt.eventType === 'up' ? STEP : -STEP)),
    );
    armAutoClose();
    if (next === current) return;
    setVolume(next);
    onChangeVolume(next);
  });

  const level = volume ?? 0;
  const iconColor = level === 0 ? 'rgba(255, 255, 255, 0.45)' : '#FFFFFF';

  return (
    // A transparent Modal spans the whole window, so flex centering is true screen center regardless of the host's offset.
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[
            {
              opacity: appear,
              transform: [
                {
                  translateX: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            ref={panelRef}
            hasTVPreferredFocus
            onLayout={() => setSelfNode(findNodeHandle(panelRef.current))}
            nextFocusUp={selfNode ?? undefined}
            nextFocusDown={selfNode ?? undefined}
            nextFocusLeft={selfNode ?? undefined}
            nextFocusRight={selfNode ?? undefined}
            onPress={onClose}
            accessibilityRole="adjustable"
            accessibilityLabel="Volume"
            accessibilityValue={{ min: 0, max: 100, now: level }}
            style={styles.panel}
          >
            <Text style={styles.value}>{volume === null ? '–' : level}</Text>

            <Svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="m6 15 6-6 6 6" />
            </Svg>

            <View style={styles.track}>
              <View style={[styles.fill, { height: `${level}%` }]} />
            </View>

            <Svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="m6 9 6 6 6-6" />
            </Svg>

            <Svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke={iconColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M11 5 6 9H2v6h4l5 4V5z" />
              {level === 0 ? (
                <Path d="m23 9-6 6M17 9l6 6" />
              ) : (
                <>
                  <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  {level > 50 && <Path d="M19 5a10 10 0 0 1 0 14" />}
                </>
              )}
            </Svg>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  panel: {
    width: 60,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 30,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
  },
  track: {
    width: 5,
    height: TRACK_HEIGHT,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
});
