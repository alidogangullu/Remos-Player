import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { TVFocusableCard } from './TVFocusableCard';
import { colors } from '../../theme';

export interface TVServiceTileProps {
  name: string;
  onPress: () => void;
  onFocus?: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

/**
 * Name-only service tile for Home's "Your Services" row — selecting one
 * opens that service's own browse panel (`ServiceBrowseScreen`). Shares
 * the surface/border of Home's other cards so the row reads as part of
 * the same shelf system.
 */
export const TVServiceTile: React.FC<TVServiceTileProps> = ({
  name,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  testID,
}) => {
  return (
    <TVFocusableCard
      onPress={onPress}
      onFocus={onFocus}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.tile}
      testID={testID}
    >
      <Text style={styles.label} numberOfLines={1}>
        {name}
      </Text>
    </TVFocusableCard>
  );
};

const styles = StyleSheet.create({
  tile: {
    minHeight: 50,
    paddingHorizontal: 22,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
