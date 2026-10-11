import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { colors, spacing } from '../../theme';

export interface TVFocusableCardProps {
  /** Optional: read-only cards still take focus so the D-pad can scroll through them. */
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  /** Focus zoom. Lower it for full-width or tall cards so they don't spill into their neighbours. */
  focusScale?: number;
  testID?: string;
  /** Native node handles for explicit cross-region D-pad wiring (see NowPlayingScreen's findNodeHandle pattern). */
  nextFocusUp?: number;
  nextFocusDown?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
}

export const TVFocusableCard: React.FC<TVFocusableCardProps> = ({
  onPress,
  onFocus,
  onBlur,
  children,
  style,
  hasTVPreferredFocus,
  focusScale = 1.04,
  testID,
  nextFocusUp,
  nextFocusDown,
  nextFocusLeft,
  nextFocusRight,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      hasTVPreferredFocus={hasTVPreferredFocus}
      testID={testID}
      nextFocusUp={nextFocusUp}
      nextFocusDown={nextFocusDown}
      nextFocusLeft={nextFocusLeft}
      nextFocusRight={nextFocusRight}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        style,
        isFocused && styles.focusedCard,
        isFocused && { transform: [{ scale: focusScale }] },
        pressed && styles.pressedCard,
      ]}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  focusedCard: {
    borderColor: colors.focusBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pressedCard: {
    transform: [{ scale: 0.98 }],
  },
});
