import React, { useRef, useEffect } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Image,
  ActivityIndicator,
} from 'react-native';
import { QueueItem } from '../../services/sonos/upnp/sonosUpnpClient';
import { TVFocusableCard } from '../../components/tv/TVFocusableCard';
import { colors, spacing } from '../../theme';

const ITEM_WIDTH = 200;
const ITEM_HEIGHT = 260;

export interface QueueViewProps {
  queue: QueueItem[];
  currentTrackUri?: string;
  currentTrackTitle?: string;
  onSelectTrack: (item: QueueItem) => void;
  isLoading?: boolean;
}

export const QueueView: React.FC<QueueViewProps> = ({
  queue,
  currentTrackUri,
  currentTrackTitle,
  onSelectTrack,
  isLoading = false,
}) => {
  const flatListRef = useRef<FlatList>(null);

  const activeIndex = queue.findIndex(
    (item) =>
      (currentTrackUri && item.uri && item.uri === currentTrackUri) ||
      (currentTrackTitle && item.title.toLowerCase() === currentTrackTitle.toLowerCase())
  );

  useEffect(() => {
    if (activeIndex >= 0 && flatListRef.current && queue.length > 0) {
      try {
        flatListRef.current.scrollToIndex({
          index: activeIndex,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        // Fallback handled
      }
    }
  }, [activeIndex, queue.length]);

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.emptySubtitle}>Loading Sonos Queue...</Text>
      </View>
    );
  }

  if (!queue || queue.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>Queue Is Empty</Text>
        <Text style={styles.emptySubtitle}>
          No queued tracks found on this speaker. Select an album or playlist to populate the queue.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={queue}
        horizontal
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={5}
        getItemLayout={(_, index) => ({
          length: ITEM_WIDTH + spacing.md,
          offset: (ITEM_WIDTH + spacing.md) * index,
          index,
        })}
        renderItem={({ item, index }) => {
          const isCurrent = index === activeIndex;

          return (
            <TVFocusableCard
              style={[styles.card, isCurrent && styles.activeCard]}
              onPress={() => onSelectTrack(item)}
              testID={`queue-item-${item.trackNumber}`}
            >
              <View style={styles.artworkWrapper}>
                {item.albumArtUri ? (
                  <Image source={{ uri: item.albumArtUri }} style={styles.artwork} />
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderIcon}>🎵</Text>
                  </View>
                )}
                {isCurrent && (
                  <View style={styles.playingBadge}>
                    <Text style={styles.playingBadgeText}>PLAYING</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.title, isCurrent && styles.activeTitle]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {item.artist}
              </Text>
              <Text style={styles.trackNumber}>#{item.trackNumber}</Text>
            </TVFocusableCard>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  card: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeCard: {
    backgroundColor: 'rgba(229, 169, 60, 0.12)',
    borderColor: colors.primary,
  },
  artworkWrapper: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.sm,
    position: 'relative',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
  },
  playingBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  playingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  activeTitle: {
    color: colors.primary,
  },
  artist: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  trackNumber: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 400,
  },
});
