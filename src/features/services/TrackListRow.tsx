import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { ArtworkImage } from '../../components/common';
import { colors, spacing } from '../../theme';

export interface TrackListRowProps {
  title: string;
  subtitle?: string;
  artworkUri?: string;
  durationMs?: number;
  /** Sub-containers (an artist's albums, a folder) open rather than play. */
  showChevron?: boolean;
  onPress: () => void;
  testID?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Full-width row in a playable container's contents list: artwork, title
 * over artist, and duration (or a chevron for sub-containers). Rows sit flat
 * on the background and only fill in on focus, keeping the list calm next to
 * the action panel.
 */
export const TrackListRow: React.FC<TrackListRowProps> = ({
  title,
  subtitle,
  artworkUri,
  durationMs,
  showChevron = false,
  onPress,
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  let trailing: string | null = null;
  if (showChevron) trailing = '›';
  else if (durationMs && durationMs > 0) trailing = formatDuration(durationMs);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={[styles.row, isFocused && styles.rowFocused]}
      testID={testID}
    >
      <ArtworkImage uri={artworkUri} title={title} style={styles.artwork} fontSize={14} />
      <View style={styles.textColumn}>
        <Text style={[styles.title, isFocused && styles.textFocused]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, isFocused && styles.subtitleFocused]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing && (
        <Text style={[showChevron ? styles.chevron : styles.duration, isFocused && styles.textFocused]}>
          {trailing}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    gap: spacing.md,
  },
  rowFocused: {
    backgroundColor: colors.focusBackground,
    transform: [{ scale: 1.01 }],
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  textFocused: {
    color: colors.focusText,
  },
  subtitleFocused: {
    // Dark grey on the white focus fill; 0.6 read as washed out at 10 feet.
    color: 'rgba(8, 8, 10, 0.72)',
  },
  duration: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    marginRight: spacing.sm,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
});
