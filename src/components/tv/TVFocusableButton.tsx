import React, { useState } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { colors } from '../../theme';

export interface TVFocusableButtonProps {
  label?: string;
  children?: React.ReactNode;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  testID?: string;
  /** Native node handles for explicit cross-region D-pad wiring (see NowPlayingScreen's findNodeHandle pattern). */
  nextFocusUp?: number;
  nextFocusDown?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
}

export const TVFocusableButton: React.FC<TVFocusableButtonProps> = ({
  label,
  children,
  onPress,
  onFocus,
  onBlur,
  style,
  textStyle,
  hasTVPreferredFocus,
  disabled = false,
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

  const content = children || (
    <Text
      style={[
        styles.text,
        isFocused && styles.focusedText,
        disabled && styles.disabledText,
        textStyle,
      ]}
    >
      {label}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      hasTVPreferredFocus={hasTVPreferredFocus}
      testID={testID}
      disabled={disabled}
      nextFocusUp={nextFocusUp}
      nextFocusDown={nextFocusDown}
      nextFocusLeft={nextFocusLeft}
      nextFocusRight={nextFocusRight}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        style,
        isFocused && styles.focusedButton,
        pressed && styles.pressedButton,
        disabled && styles.disabledButton,
      ]}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedButton: {
    borderColor: colors.focusBorder,
    borderWidth: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    transform: [{ scale: 1.04 }],
  },
  pressedButton: {
    transform: [{ scale: 0.98 }],
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  disabledButton: {
    opacity: 0.4,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  focusedText: {
    color: colors.primary,
  },
  disabledText: {
    color: colors.textMuted,
  },
});
