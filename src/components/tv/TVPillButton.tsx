import React, { useState } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { colors } from '../../theme';

export interface TVPillButtonProps {
  label: string;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  testID?: string;
}

export const TVPillButton: React.FC<TVPillButtonProps> = ({
  label,
  onPress,
  onFocus,
  onBlur,
  style,
  hasTVPreferredFocus,
  disabled = false,
  testID,
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
      disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isFocused && styles.focusedButton,
        pressed && styles.pressedButton,
        disabled && styles.disabledButton,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          isFocused && styles.focusedText,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    minWidth: 160,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedButton: {
    borderColor: colors.focusBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
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
