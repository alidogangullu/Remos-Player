import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TVFocusableCard } from '../tv/TVFocusableCard';
import { ArtworkImage } from './ArtworkImage';
import { colors } from '../../theme';

export interface ResultCardProps {
  title: string;
  subtitle?: string;
  albumArtUri?: string;
  /** Small uppercase badge, e.g. "TRACK" / "ALBUM" / "PLAYLIST". */
  typeBadge?: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

const CARD_WIDTH = 168;

/**
 * Square result card — the shared shape for search results, service-panel
 * browse items, and favorites. Matches `HomeScreen`'s "squareCard" template
 * (168px, 1:1 artwork, badge, two-line text block) rather than
 * `FavoriteCard`'s raw `<Image>`, so artwork-less SMAPI results (common —
 * SMAPI often omits `albumArtURI`) fall back gracefully via `ArtworkImage`.
 */
export const ResultCard: React.FC<ResultCardProps> = ({
  title,
  subtitle,
  albumArtUri,
  typeBadge,
  onPress,
  hasTVPreferredFocus,
  testID,
}) => {
  return (
    <TVFocusableCard
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.imageContainer}>
        <ArtworkImage uri={albumArtUri} title={title} style={styles.image} fontSize={28} />
        {typeBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{typeBadge.toLocaleUpperCase('en-US')}</Text>
          </View>
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TVFocusableCard>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    padding: 0,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textPrimary,
    // Uppercased in JS with a fixed locale: textTransform follows the device
    // locale, which turns "i" into "İ" on a Turkish TV.
  },
  textContainer: {
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
