import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme';

const ENTER_MS = 200;
/** Exits run ~70% of the enter so dismissal feels responsive. */
const EXIT_MS = 140;
const RISE_PX = 8;

/** `info` for "in progress / heads-up", `success` for a finished action, `error` for a failed one. */
export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastProps {
  /** The message to show; `null` fades the toast out. */
  message: string | null;
  variant?: ToastVariant;
  /** Positioning (absolute offsets, alignment) supplied by the host. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface ShownToast {
  message: string;
  variant: ToastVariant;
}

/**
 * Transient, non-focusable feedback pill (status marker + one line of text).
 * It never takes D-pad focus and is announced politely to screen readers.
 * Screens don't render this directly — they call `useToast()`, and
 * `ToastProvider` owns the single on-screen instance and its timing.
 */
export const Toast: React.FC<ToastProps> = ({ message, variant = 'info', style, testID }) => {
  const progress = useRef(new Animated.Value(0)).current;
  // Holds the last message on screen while the exit fade runs.
  const [shown, setShown] = useState<ShownToast | null>(message ? { message, variant } : null);

  useEffect(() => {
    if (message) {
      setShown({ message, variant });
      Animated.timing(progress, {
        toValue: 1,
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [message, variant, progress]);

  if (!shown) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] });
  const isError = shown.variant === 'error';

  return (
    <Animated.View
      pointerEvents="none"
      focusable={false}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      style={[
        styles.toast,
        isError && styles.toastError,
        style,
        { opacity: progress, transform: [{ translateY }] },
      ]}
      testID={testID}
    >
      <View style={[styles.indicator, isError && styles.indicatorError]} />
      <Text style={styles.text} numberOfLines={1}>
        {shown.message}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(28, 28, 31, 0.96)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toastError: {
    borderColor: 'rgba(255, 69, 58, 0.45)',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  indicatorError: {
    backgroundColor: colors.statusError,
  },
  text: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});
