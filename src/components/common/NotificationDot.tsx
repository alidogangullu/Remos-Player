import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../theme';

export interface NotificationDotProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Small amber marker for "something new here" (unread notification, update). */
export const NotificationDot: React.FC<NotificationDotProps> = ({ size = 8, style }) => (
  <View
    focusable={false}
    accessibilityElementsHidden
    importantForAccessibility="no"
    style={[styles.dot, { width: size, height: size, borderRadius: size / 2 }, style]}
  />
);

const styles = StyleSheet.create({
  dot: {
    backgroundColor: colors.primary,
  },
});
