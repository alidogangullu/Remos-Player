import React, { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { ArtworkImage } from '../../components/common';
import { colors, spacing } from '../../theme';

export interface ServiceNavRowProps {
  title: string;
  iconUri?: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

/**
 * "Artists / Albums / Songs / Playlists / Recently Added" style navigation
 * row for a service's root browse panel — icon avatar, label, chevron.
 * There's no existing chevron-list component in the repo to reuse (Settings
 * uses sliders/toggles, Favorites/Home use cards), so this is new but kept
 * local to the services feature since it is specific to SMAPI container
 * navigation.
 */
export const ServiceNavRow: React.FC<ServiceNavRowProps> = ({
  title,
  iconUri,
  onPress,
  hasTVPreferredFocus,
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={[styles.row, isFocused && styles.rowFocused]}
      testID={testID}
    >
      <ArtworkImage uri={iconUri} title={title} style={styles.icon} fontSize={16} />
      <Text style={[styles.title, isFocused && styles.titleFocused]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.chevron, isFocused && styles.titleFocused]}>›</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexBasis: '46%',
    flexGrow: 1,
    maxWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    gap: spacing.md,
  },
  rowFocused: {
    backgroundColor: colors.focusBackground,
    transform: [{ scale: 1.01 }],
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  titleFocused: {
    color: colors.focusText,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
  },
});
