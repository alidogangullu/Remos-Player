import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../../theme';

export interface TVKeyboardKeyProps {
  label: string;
  onPress: () => void;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

/**
 * One key of `TVKeyboard`. Unlike `TVFocusableButton` (outlined focus ring,
 * amber label), a focused key inverts to solid white with dark text — the
 * D-pad cursor must be readable at a glance across a dense letter grid.
 */
export const TVKeyboardKey: React.FC<TVKeyboardKeyProps> = ({
  label,
  onPress,
  onFocus,
  style,
  hasTVPreferredFocus,
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      testID={testID}
      onFocus={() => {
        setIsFocused(true);
        onFocus?.();
      }}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        style,
        isFocused && styles.focusedKey,
        pressed && styles.pressedKey,
      ]}
    >
      <Text style={[styles.text, isFocused && styles.focusedText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  focusedKey: {
    backgroundColor: colors.focusBackground,
    transform: [{ scale: 1.06 }],
  },
  pressedKey: {
    transform: [{ scale: 0.96 }],
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  focusedText: {
    color: colors.focusText,
    fontWeight: '700',
  },
});
