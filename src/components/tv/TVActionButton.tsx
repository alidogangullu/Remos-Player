import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme';

export interface TVActionButtonProps {
  label: string;
  /** Renders the icon in the color for the button's current state. */
  renderIcon?: (color: string) => React.ReactNode;
  /**
   * `primary` is the one main action of a screen (amber fill); `secondary`
   * sits back (translucent pill); `ghost` is just icon + label until focused,
   * for a stack of lesser actions under a primary one.
   */
  variant?: 'primary' | 'secondary' | 'ghost';
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Icon + label pill for a screen's action row (e.g. Play / Play Next / Add
 * to Queue on a playlist). Every variant shares one focus treatment — white
 * fill, dark content, slight lift — matching the app's other focused rows,
 * so the D-pad position is unmistakable at 10 feet regardless of variant.
 */
export const TVActionButton: React.FC<TVActionButtonProps> = ({
  label,
  renderIcon,
  variant = 'secondary',
  onPress,
  hasTVPreferredFocus,
  style,
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';

  let contentColor: string = colors.textPrimary;
  if (isFocused || isPrimary) contentColor = colors.focusText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        isFocused && styles.focused,
        pressed && styles.pressed,
        style,
      ]}
    >
      {renderIcon?.(contentColor)}
      <Text style={[styles.label, isGhost && styles.ghostLabel, { color: contentColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    minWidth: 148,
  },
  secondary: {
    backgroundColor: colors.pillBackground,
    borderColor: colors.glassBorder,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  focused: {
    backgroundColor: colors.focusBackground,
    borderColor: colors.focusBorder,
    transform: [{ scale: 1.05 }],
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  ghostLabel: {
    fontWeight: '500',
  },
});
