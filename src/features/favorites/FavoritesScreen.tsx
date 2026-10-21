import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { colors, spacing } from '../../theme';
import { FavoriteCard, FavoriteItem } from './FavoriteCard';
import { TVFocusableButton } from '../../components/tv/TVFocusableButton';
import { SonosUpnpClient } from '../../services/sonos/upnp/sonosUpnpClient';
import { playFavorite, isShortcutFavorite } from '../../services/sonos/favoritePlayback';
import { labelSingleTrackAlbums } from '../../services/sonos/favoriteDisplay';
import { useToast } from '../../components/common';


export interface FavoritesScreenProps {
  speakerIp: string;
  /** The zone player's RINCON id — album/playlist favorites play through its queue. */
  speakerId: string;
  onSelectFavorite?: (favorite: FavoriteItem) => void;
}

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  speakerIp,
  speakerId,
  onSelectFavorite,
}) => {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(speakerIp));
  const toast = useToast();
  const isMountedRef = useRef(true);

  const fetchLiveFavorites = useCallback(async () => {
    if (!speakerIp) {
      if (isMountedRef.current) setIsLoading(false);
      return;
    }
    if (isMountedRef.current) setIsLoading(true);
    try {
      const live = await SonosUpnpClient.getFavorites(speakerIp);
      if (isMountedRef.current && live && live.length > 0) {
        setFavorites(live);
        // Then swap one-song "albums" (a single liked song) for that song's own labels.
        const labeled = await labelSingleTrackAlbums(speakerIp, live);
        if (isMountedRef.current && labeled !== live) setFavorites(labeled);
      }
    } catch {
      // Graceful fallback
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [speakerIp]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (speakerIp) {
      fetchLiveFavorites();
    } else {
      setIsLoading(false);
    }
  }, [speakerIp, fetchLiveFavorites]);

  const handleSelect = async (item: FavoriteItem) => {
    onSelectFavorite?.(item);

    if (isShortcutFavorite(item)) {
      toast.info(`"${item.title}" is a browse shortcut — open it in the Sonos app`);
      return;
    }
    toast.info(`Starting "${item.title}"…`);

    try {
      await playFavorite(speakerIp, speakerId, item, '');
      toast.success(`Playing "${item.title}"`);
    } catch {
      toast.error(`Couldn't play "${item.title}"`);
    }
  };

  const handleRefresh = async () => {
    if (speakerIp) {
      setIsLoading(true);
      try {
        const live = await SonosUpnpClient.getFavorites(speakerIp);
        if (live && live.length > 0) {
          setFavorites(await labelSingleTrackAlbums(speakerIp, live));
          setIsLoading(false);
          return;
        }
      } catch {
        // Fallback
      } finally {
        setIsLoading(false);
      }
    }
    // No live favorites found — leave empty list displayed
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer} testID="favorites-loading">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.header}>Sonos Favorites</Text>
            <Text style={styles.headerSubtitle}>Pinned Radios, Mixes & Playlists</Text>
          </View>
          <Text style={styles.emptyIcon}>★</Text>
          <Text style={styles.emptyTitle}>No Favorites Found</Text>
          <Text style={styles.emptySubtitle}>
            Add radios, playlists, or albums to "My Sonos" in the Sonos mobile app to quickly access them here.
          </Text>
          <TVFocusableButton
            label="Refresh Favorites"
            onPress={handleRefresh}
            style={styles.refreshButton}
            testID="refresh-favorites-button"
          />
        </View>
      ) : (
        <FlatList
          data={
            favorites.length % 5 !== 0
              ? [...favorites, ...Array(5 - (favorites.length % 5)).fill(null)]
              : favorites
          }
          keyExtractor={(item, index) => (item ? item.id : `empty-slot-${index}`)}
          numColumns={5}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerRow}>
              <Text style={styles.header}>Sonos Favorites</Text>
              <Text style={styles.headerSubtitle}>Pinned Radios, Mixes & Playlists</Text>
            </View>
          }
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            if (!item) {
              return <View style={styles.emptySlot} />;
            }
            return (
              <FavoriteCard
                favorite={item}
                onPress={() => handleSelect(item)}
              />
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    marginBottom: spacing.headerBottom,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },
  listContainer: {
    paddingTop: 76,
    paddingBottom: spacing.xxl,
    paddingHorizontal: 36,
  },
  columnWrapper: {
    gap: spacing.md,
  },
  emptySlot: {
    flex: 1,
    marginBottom: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 92,
    paddingBottom: 80,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: spacing.md,
    color: colors.textSecondary,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 18,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 600,
    marginBottom: spacing.xl,
    lineHeight: 26,
  },
  refreshButton: {
    minWidth: 200,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 92,
  },
});
