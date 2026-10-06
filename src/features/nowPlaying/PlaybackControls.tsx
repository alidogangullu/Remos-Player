import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Pressable, findNodeHandle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { spacing } from '../../theme';
import { LyricIcon } from './LyricIcon';

interface ControlButtonProps {
  onPress: () => void;
  active?: boolean;
  activeTransparent?: boolean;
  children: (focused: boolean, active: boolean) => React.ReactNode;
  disabled?: boolean;
  nextFocusDown?: number | null;
  onLayout?: (node: number | null) => void;
  hasTVPreferredFocus?: boolean;
  /** Each change pulls D-pad focus onto this button. */
  focusSignal?: number;
  accessibilityLabel?: string;
  testID?: string;
  isPrimary?: boolean;
}

function ControlButton({
  onPress,
  active = false,
  activeTransparent = false,
  children,
  disabled,
  nextFocusDown,
  onLayout,
  hasTVPreferredFocus,
  focusSignal,
  accessibilityLabel,
  testID,
  isPrimary = false,
}: Readonly<ControlButtonProps>) {
  const buttonRef = useRef<View | null>(null);

  useEffect(() => {
    if (!focusSignal) return;
    // Deferred so the element that held focus (e.g. an overlay) has unmounted first.
    const timer = setTimeout(() => (buttonRef.current as any)?.requestTVFocus?.(), 0);
    return () => clearTimeout(timer);
  }, [focusSignal]);

  return (
    <Pressable
      ref={buttonRef}
      onPress={onPress}
      disabled={disabled}
      nextFocusDown={nextFocusDown}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      onLayout={() => onLayout?.(findNodeHandle(buttonRef.current))}
      style={({ focused }) => [
        isPrimary ? styles.primaryButton : styles.secondaryButton,
        // Active (unfocused) style: subtle Sonos matte pill
        active && !focused && !activeTransparent && styles.buttonActive,
        // Focused style: high contrast Sonos focus surface
        focused && styles.buttonFocused,
        // When both active and focused
        active && focused && styles.buttonActiveFocused,
        disabled && styles.buttonDisabled,
      ]}
    >
      {({ focused }) => (
        <>
          {children(focused, active)}
          {/* Sonos Active State Indicator Dot for secondary controls */}
          {active && !isPrimary && !activeTransparent && (
            <View
              style={[
                styles.activeDot,
                focused ? styles.activeDotFocused : styles.activeDotUnfocused,
              ]}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

export interface PlaybackControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** Omitted for live radio, which has no previous/next track. */
  onNext?: () => void;
  onPrevious?: () => void;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  isRepeat?: boolean;
  onToggleRepeat?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  showLyrics?: boolean;
  onToggleLyrics?: () => void;
  showQueue?: boolean;
  onToggleQueue?: () => void;
  showVolume?: boolean;
  onOpenVolume?: () => void;
  /** Increment to move focus back to the volume button (e.g. after its panel closes). */
  volumeFocusSignal?: number;
  disabled?: boolean;
  nextFocusDown?: number | null;
  onLayoutButton?: (node: number | null) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = React.memo(({
  isPlaying,
  onTogglePlay,
  onNext,
  onPrevious,
  isShuffle = false,
  onToggleShuffle,
  isRepeat = false,
  onToggleRepeat,
  isFavorite = false,
  onToggleFavorite,
  showLyrics = false,
  onToggleLyrics,
  showQueue = false,
  onToggleQueue,
  showVolume = false,
  onOpenVolume,
  volumeFocusSignal,
  disabled = false,
  nextFocusDown,
  onLayoutButton,
}) => {
  const getIconColor = (focused: boolean, active: boolean = false) => {
    if (focused) return '#08080A'; // Deep obsidian on white focused surface
    if (active) return '#FFFFFF'; // Crisp solid white when active/toggled on
    return 'rgba(255, 255, 255, 0.55)'; // Perfectly balanced Sonos gray
  };

  return (
    <View style={styles.container}>
      {/* Primary Transport Group */}
      <View style={styles.primaryGroup}>
        {onPrevious && (
          <ControlButton
            onPress={onPrevious}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel="Previous"
            testID="control-prev"
            isPrimary
          >
            {(focused) => (
              <Svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={getIconColor(focused)}
              >
                <Path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </Svg>
            )}
          </ControlButton>
        )}

        <ControlButton
          onPress={onTogglePlay}
          disabled={disabled}
          nextFocusDown={nextFocusDown}
          hasTVPreferredFocus
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          testID="control-play-pause"
          onLayout={(node: number | null) => onLayoutButton?.(node)}
          isPrimary
        >
          {(focused) => (
            <Svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={getIconColor(focused)}
            >
              {isPlaying ? (
                <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              ) : (
                <Path d="M8 5v14l11-7z" />
              )}
            </Svg>
          )}
        </ControlButton>

        {onNext && (
          <ControlButton
            onPress={onNext}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel="Next"
            testID="control-next"
            isPrimary
          >
            {(focused) => (
              <Svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={getIconColor(focused)}
              >
                <Path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </Svg>
            )}
          </ControlButton>
        )}
      </View>

      {/* Secondary Controls Group */}
      <View style={styles.secondaryGroup}>
        {/* Shuffle */}
        {onToggleShuffle && (
          <ControlButton
            onPress={onToggleShuffle}
            active={isShuffle}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel="Shuffle"
            testID="control-shuffle"
          >
            {(focused, active) => (
              <Svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke={getIconColor(focused, active)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M16 3h5v5" />
                <Path d="M4 20L21 3" />
                <Path d="M21 16v5h-5" />
                <Path d="M15 15l6 6" />
                <Path d="M4 4l5 5" />
              </Svg>
            )}
          </ControlButton>
        )}

        {/* Repeat */}
        {onToggleRepeat && (
          <ControlButton
            onPress={onToggleRepeat}
            active={isRepeat}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel="Repeat"
            testID="control-repeat"
          >
            {(focused, active) => (
              <Svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke={getIconColor(focused, active)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="m17 2 4 4-4 4" />
                <Path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <Path d="m7 22-4-4 4-4" />
                <Path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </Svg>
            )}
          </ControlButton>
        )}

        {/* Favorite */}
        {onToggleFavorite && (
          <ControlButton
            onPress={onToggleFavorite}
            active={isFavorite}
            activeTransparent
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel={isFavorite ? 'Saved' : 'Save'}
            testID="control-favorite"
          >
            {(focused, active) => {
              let favFill = 'none';
              let favStroke = getIconColor(focused, active);
              if (focused) {
                favFill = active ? '#08080A' : 'none';
                favStroke = '#08080A';
              } else if (active) {
                favFill = '#FFFFFF';
                favStroke = '#FFFFFF';
              }
              return (
                <Svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill={favFill}
                  stroke={favStroke}
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </Svg>
              );
            }}
          </ControlButton>
        )}

        {/* Lyrics Button */}
        {onToggleLyrics && (
          <ControlButton
            onPress={onToggleLyrics}
            active={showLyrics}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel={showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
            testID="control-lyrics"
          >
            {(focused, active) => (
              <LyricIcon
                active={active}
                focused={focused}
                color={
                  focused
                    ? '#08080A'
                    : active
                    ? '#FFFFFF'
                    : 'rgba(255, 255, 255, 0.48)'
                }
              />
            )}
          </ControlButton>
        )}

        {/* Queue Button */}
        {onToggleQueue && (
          <ControlButton
            onPress={onToggleQueue}
            active={showQueue}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            accessibilityLabel={showQueue ? 'Hide Queue' : 'Show Queue'}
            testID="control-queue"
          >
            {(focused, active) => (
              <Svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={getIconColor(focused, active)}
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M4 12h16" />
                <Path d="M4 6h16" />
                <Path d="M4 18h16" />
              </Svg>
            )}
          </ControlButton>
        )}

        {onOpenVolume && (
          <ControlButton
            onPress={onOpenVolume}
            active={showVolume}
            disabled={disabled}
            nextFocusDown={nextFocusDown}
            focusSignal={volumeFocusSignal}
            accessibilityLabel="Volume"
            testID="control-volume"
          >
            {(focused, active) => (
              <Svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={getIconColor(focused, active)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M11 5 6 9H2v6h4l5 4V5z" />
                <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <Path d="M19 5a10 10 0 0 1 0 14" />
              </Svg>
            )}
          </ControlButton>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: -spacing.sm,
  },
  primaryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Unified circular button styles (Sonos hardware / TV design language)
  primaryButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  secondaryButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  // Active / Selected state (unfocused): Sonos circular matte elevated surface
  buttonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  // Focused state: Crisp high-contrast circular Sonos TV focus surface with subtle shadow
  buttonFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.05 }],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  // Active and Focused: Keeps the circular high-contrast white background with dark icon
  buttonActiveFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.05 }],
  },
  buttonDisabled: {
    opacity: 0.25,
  },
  // Sonos Active Indicator Dot
  activeDot: {
    position: 'absolute',
    bottom: 3.5,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  activeDotUnfocused: {
    backgroundColor: '#FFFFFF',
  },
  activeDotFocused: {
    backgroundColor: '#08080A',
  },
});
