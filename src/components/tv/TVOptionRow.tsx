import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing } from '../../theme';

export interface TVOptionRowProps {
  label: string;
  /** Secondary line under the label. */
  detail?: string;
  selected?: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

/**
 * One choice in a single-select list (e.g. Settings › Language): the label,
 * an optional detail line and a check mark on the selected row. Focus uses
 * the same solid-white treatment as the side-tab rail; selection only changes
 * on OK, never on focus.
 */
export const TVOptionRow: React.FC<TVOptionRowProps> = ({
  label,
  detail,
  selected = false,
  onPress,
  hasTVPreferredFocus,
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const checkColor = isFocused ? colors.focusText : colors.primary;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected, isFocused && styles.rowFocused]}
      testID={testID}
    >
      <View style={styles.textCol}>
        <Text
          numberOfLines={1}
          style={[styles.label, selected && styles.labelSelected, isFocused && styles.labelFocused]}
        >
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[styles.detail, isFocused && styles.detailFocused]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke={checkColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md + spacing.xs,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: 10,
  },
  rowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowFocused: {
    backgroundColor: colors.focusBackground,
    transform: [{ scale: 1.02 }],
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 18,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  labelFocused: {
    color: colors.focusText,
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    color: colors.textMuted,
  },
  detailFocused: {
    color: 'rgba(8, 8, 10, 0.65)',
  },
});
