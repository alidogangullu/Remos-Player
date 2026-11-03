import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../../theme';

export interface ProBadgeProps {
  label: string;
}

/** Amber tag marking Pro content. */
export const ProBadge: React.FC<ProBadgeProps> = ({ label }) => <Text style={styles.badge}>{label}</Text>;

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.primary,
    backgroundColor: colors.ambientGlow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
