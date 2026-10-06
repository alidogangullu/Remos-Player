import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, spacing } from '../../theme';
import { TVFocusableCard } from '../../components/tv/TVFocusableCard';

export interface FavoriteItem {
  id: string;
  title: string;
  type: string;
  subtitle?: string;
  albumArtUri?: string;
  uri?: string;
  metadata?: string;
}

export interface FavoriteCardProps {
  favorite: FavoriteItem;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

export const FavoriteCard: React.FC<FavoriteCardProps> = ({
  favorite,
  onPress,
  hasTVPreferredFocus,
}) => {
  return (
    <TVFocusableCard
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.card}
      testID={`favorite-card-${favorite.id}`}
    >
      <View style={styles.imageContainer}>
        {favorite.albumArtUri ? (
          <Image
            source={{ uri: favorite.albumArtUri }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>
              {favorite.type.toLowerCase().includes('radio') ? '📻' : '♪'}
            </Text>
          </View>
        )}
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{favorite.type.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {favorite.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {favorite.subtitle || favorite.type.toUpperCase()}
        </Text>
      </View>
    </TVFocusableCard>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBorder,
  },
  placeholderIcon: {
    fontSize: 48,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  textContainer: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 58,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});
