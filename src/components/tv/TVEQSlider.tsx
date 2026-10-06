import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing } from '../../theme';

export interface TVEQSliderProps {
  title: string;
  description: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  valueFormatter?: (val: number) => string;
  onChange: (val: number) => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

export const TVEQSlider: React.FC<TVEQSliderProps> = ({
  title,
  description,
  value,
  min = -10,
  max = 10,
  step = 1,
  valueFormatter,
  onChange,
  hasTVPreferredFocus,
  testID,
}) => {
  const [minusFocused, setMinusFocused] = useState(false);
  const [plusFocused, setPlusFocused] = useState(false);

  const isMin = value <= min;
  const isMax = value >= max;

  const handleDecrement = () => {
    if (!isMin) {
      onChange(Math.max(min, value - step));
    }
  };

  const handleIncrement = () => {
    if (!isMax) {
      onChange(Math.min(max, value + step));
    }
  };

  const formatValue = (val: number): string => {
    if (valueFormatter) return valueFormatter(val);
    if (val > 0) return `+${val}`;
    return `${val}`;
  };

  // For bipolar center-zero gauges vs positive-only gauges
  const isBipolar = min < 0 && max > 0;
  const positiveFillPercent = isBipolar
    ? (value > 0 ? (Math.min(value, max) / (max || 1)) * 50 : 0)
    : Math.max(0, Math.min(100, ((value - min) / ((max - min) || 1)) * 100));
  const negativeFillPercent = isBipolar && value < 0
    ? (Math.min(Math.abs(value), Math.abs(min)) / (Math.abs(min) || 1)) * 50
    : 0;

  return (
    <View style={styles.container} testID={testID}>
      {/* Left side: Title and Description */}
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      {/* Right side: Compact inline control group */}
      <View style={styles.controlGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${title}, currently ${formatValue(value)}`}
          disabled={isMin}
          hasTVPreferredFocus={hasTVPreferredFocus}
          onFocus={() => setMinusFocused(true)}
          onBlur={() => setMinusFocused(false)}
          onPress={handleDecrement}
          testID={testID ? `${testID}-minus` : undefined}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.stepperButton,
            minusFocused && styles.focusedButton,
            pressed && styles.pressedButton,
            isMin && styles.disabledButton,
          ]}
        >
          <Text style={styles.stepperSymbol}>−</Text>
        </Pressable>

        {/* Compact Bipolar Center-Zero Gauge */}
        <View style={styles.gaugeContainer}>
          <View style={styles.track}>
            {/* Center Zero reference line */}
            <View style={styles.centerTick} />

            {/* Positive fill extending right from center */}
            {value > 0 && (
              <View
                style={[
                  styles.fillPositive,
                  { width: `${positiveFillPercent}%` },
                ]}
              />
            )}

            {/* Negative fill extending left from center */}
            {value < 0 && (
              <View
                style={[
                  styles.fillNegative,
                  { width: `${negativeFillPercent}%` },
                ]}
              />
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${title}, currently ${formatValue(value)}`}
          disabled={isMax}
          onFocus={() => setPlusFocused(true)}
          onBlur={() => setPlusFocused(false)}
          onPress={handleIncrement}
          testID={testID ? `${testID}-plus` : undefined}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.stepperButton,
            plusFocused && styles.focusedButton,
            pressed && styles.pressedButton,
            isMax && styles.disabledButton,
          ]}
        >
          <Text style={styles.stepperSymbol}>+</Text>
        </Pressable>

        {/* Value Badge */}
        <View style={[styles.badgeContainer, value !== 0 && styles.activeBadgeContainer]}>
          <Text
            testID={testID ? `${testID}-value` : undefined}
            style={[styles.badgeText, value !== 0 && styles.activeBadgeText]}
          >
            {formatValue(value)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
    minHeight: 92,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  description: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 20,
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedButton: {
    borderColor: colors.focusBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ scale: 1.08 }],
  },
  pressedButton: {
    transform: [{ scale: 0.95 }],
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  disabledButton: {
    opacity: 0.3,
  },
  stepperSymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 26,
    textAlign: 'center',
  },
  gaugeContainer: {
    width: 170,
    marginHorizontal: spacing.md,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  centerTick: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    width: 2,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 1,
    zIndex: 2,
  },
  fillPositive: {
    position: 'absolute',
    left: '50%',
    height: '100%',
    backgroundColor: colors.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  fillNegative: {
    position: 'absolute',
    right: '50%',
    height: '100%',
    backgroundColor: colors.primary,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  badgeContainer: {
    marginLeft: spacing.md,
    width: 64,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadgeContainer: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  activeBadgeText: {
    color: colors.primary,
  },
});
