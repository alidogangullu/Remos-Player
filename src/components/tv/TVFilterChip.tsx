import React, { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export interface TVFilterChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

/**
 * Service/category filter chip for the search results pane (e.g. "All",
 * "Apple Music", "Spotify"). Distinguishes *active* (selected filter) from
 * *focused* (D-pad cursor) the same way `TopBar`'s tabs do — active is a
 * translucent white pill, focused is solid white with dark text.
 */
export const TVFilterChip: React.FC<TVFilterChipProps> = ({
  label,
  active = false,
  onPress,
  hasTVPreferredFocus,
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      testID={testID}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={[
        styles.chip,
        active && styles.activeChip,
        isFocused && styles.focusedChip,
      ]}
    >
      <Text
        style={[
          styles.text,
          active && styles.activeText,
          isFocused && styles.focusedText,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  activeChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  focusedChip: {
    backgroundColor: colors.focusBackground,
    borderColor: colors.focusBorder,
    transform: [{ scale: 1.04 }],
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  activeText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  focusedText: {
    color: colors.focusText,
    fontWeight: '700',
  },
});
