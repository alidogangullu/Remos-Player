import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { colors, spacing } from '../../theme';
import { TVFocusableCard } from '../../components/tv/TVFocusableCard';
import { ArtworkImage } from '../../components/common';
import { SonosUpnpClient } from '../../services/sonos/upnp/sonosUpnpClient';
import { playFavorite, isShortcutFavorite } from '../../services/sonos/favoritePlayback';
import { labelSingleTrackAlbums } from '../../services/sonos/favoriteDisplay';
import { ServicesRow } from '../services/ServicesRow';
import { ServiceBrowseScreen } from '../services/ServiceBrowseScreen';
import { useMusicServices, LinkedService } from '../services/useMusicServices';
import { buildSmapiContexts } from '../../services/sonos/smapi/smapiContextBuilder';
import { SmapiContext } from '../../services/sonos/smapi/smapiClient';
import { log } from '../../utils/logger';

const TAG = 'HomeScreen';
/** Jump Back In is a 2x3 grid. */
const JUMP_BACK_IN_COUNT = 6;
/** The Favorites tab lists everything; Home only needs a shelf's worth. */
const FAVORITES_SHELF_LIMIT = 20;

export interface HomeQuickAccessItem {
  id: string;
  title: string;
  subtitle?: string;
  albumArtUri?: string;
  uri?: string;
  metadata?: string;
}

export interface HomeCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  albumArtUri: string;
  uri: string;
  /** DIDL-Lite sent with `uri`; without it the speaker reports no title ("Sonos Audio"). */
  metadata?: string;
}

import { PlaybackHistoryService, buildBasicDidl } from '../../services/history/playbackHistoryService';

export interface HomeScreenProps {
  speakerIp: string;
  /** The zone player's RINCON id — needed by `ServiceBrowseScreen`'s queue actions. */
  speakerId: string;
  /** False while the tab is kept mounted but hidden; its Back handler must not fire then. */
  isActive?: boolean;
  quickAccess?: HomeQuickAccessItem[];
  favorites?: HomeCarouselItem[];
  featuredStations?: HomeCarouselItem[];
  onSelectItem?: (item: HomeQuickAccessItem | HomeCarouselItem) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  speakerIp,
  speakerId,
  isActive = true,
  quickAccess: propQuickAccess,
  favorites: propFavorites,
  featuredStations: propFeaturedStations,
  onSelectItem,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [liveFavorites, setLiveFavorites] = useState<HomeCarouselItem[]>([]);
  const [playbackHistory, setPlaybackHistory] = useState<HomeCarouselItem[]>([]);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const musicServices = useMusicServices(speakerIp);
  const [serviceContexts, setServiceContexts] = useState<SmapiContext[]>([]);
  /** The service whose browse panel is open; Home's shelves stay mounted (hidden) underneath. */
  const [openServiceCtx, setOpenServiceCtx] = useState<SmapiContext | null>(null);
  /** Set when a browse panel closes, so focus lands back on the tile that opened it. */
  const [returnFocusServiceId, setReturnFocusServiceId] = useState<string | null>(null);

  // Rebuilt whenever the linked-service list reloads (e.g. after a sync).
  useEffect(() => {
    let isMounted = true;
    buildSmapiContexts(speakerIp)
      .then((contexts) => {
        if (isMounted) setServiceContexts(contexts);
      })
      .catch((error) => log.error(TAG, 'Failed to build SMAPI contexts', error));
    return () => {
      isMounted = false;
    };
  }, [speakerIp, musicServices.services]);

  useEffect(() => {
    if (!isActive || !openServiceCtx) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeService();
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, openServiceCtx]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Sonos Favorites (ContentDirectory "FV:2") for the Favorites shelf. Re-read
  // each time Home is shown, since favorites are edited from the Sonos app.
  useEffect(() => {
    if (!speakerIp || propFavorites || !isActive) return;
    let isMounted = true;
    SonosUpnpClient.getFavorites(speakerIp)
      .then(async (favs) => {
        if (!isMounted) return;
        const mapped: HomeCarouselItem[] = favs.map((f) => ({
          id: f.id,
          title: f.title,
          subtitle: f.subtitle || f.type || 'Favorite',
          albumArtUri: f.albumArtUri ?? '',
          uri: f.uri ?? '',
          // The favorite's own DIDL — service favorites won't play from a bare URI.
          metadata: f.metadata,
        }));
        setLiveFavorites(mapped);
        // Then swap one-song "albums" (a single liked song) for that song's own labels.
        const labeled = await labelSingleTrackAlbums(speakerIp, mapped);
        if (isMounted && labeled !== mapped) setLiveFavorites(labeled);
      })
      .catch((error) => log.error(TAG, 'Failed to load Sonos favorites', error));
    return () => {
      isMounted = false;
    };
  }, [speakerIp, propFavorites, isActive]);

  // Local playback history for Jump Back In. Home stays mounted while hidden,
  // so re-read it whenever the tab comes back into view.
  useEffect(() => {
    if (!speakerIp || propQuickAccess || !isActive) return;
    let isMounted = true;
    PlaybackHistoryService.getRecentlyPlayed().then(async (history) => {
      if (!isMounted) return;
      if (history.length > 0) {
        setPlaybackHistory(history);
        return;
      }
      // Empty history: seed it with whatever the speaker is playing right now.
      try {
        const pos = await SonosUpnpClient.getPositionInfo(speakerIp);
        if (pos?.metadata?.title && pos.metadata.title.toLowerCase() !== 'audio') {
          await PlaybackHistoryService.addTrack({
            title: pos.metadata.title,
            artist: pos.metadata.artist,
            album: pos.metadata.album,
            albumArtUri: pos.metadata.albumArtUri,
            uri: pos.metadata.uri,
          });
          const refreshed = await PlaybackHistoryService.getRecentlyPlayed();
          if (isMounted) setPlaybackHistory(refreshed);
        }
      } catch {
        // Non-blocking
      }
    });
    return () => {
      isMounted = false;
    };
  }, [speakerIp, propQuickAccess, isActive]);

  const quickAccess = propQuickAccess ?? playbackHistory.slice(0, JUMP_BACK_IN_COUNT);
  const favorites = propFavorites ?? liveFavorites.slice(0, FAVORITES_SHELF_LIMIT);
  const featuredStations = propFeaturedStations ?? [];

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleSelectService = async ({ service }: LinkedService) => {
    let ctx = serviceContexts.find((c) => c.service.serviceId === service.serviceId);
    if (!ctx) {
      // Contexts may still be building (first mount / right after a sync).
      try {
        ctx = (await buildSmapiContexts(speakerIp)).find((c) => c.service.serviceId === service.serviceId);
      } catch (error) {
        log.error(TAG, `Failed to build SMAPI context for ${service.name}`, error);
      }
    }
    if (!ctx) {
      showToast(`Couldn't open ${service.name}`);
      return;
    }
    setReturnFocusServiceId(null);
    setOpenServiceCtx(ctx);
  };

  const closeService = () => {
    setReturnFocusServiceId(openServiceCtx?.service.serviceId ?? null);
    setOpenServiceCtx(null);
  };

  const handlePlay = async (item: HomeQuickAccessItem | HomeCarouselItem) => {
    onSelectItem?.(item);
    if (isShortcutFavorite(item)) {
      showToast(`"${item.title}" is a browse shortcut — open it in the Sonos app`);
      return;
    }
    showToast(`Playing "${item.title}"`);

    try {
      await playFavorite(speakerIp, speakerId, item, buildBasicDidl(item), serviceContexts);
    } catch (error) {
      log.error(TAG, `Failed to play "${item.title}"`, error);
      showToast(`Couldn't play "${item.title}"`);
    }
  };

  const isEmpty = quickAccess.length === 0 && favorites.length === 0 && featuredStations.length === 0;

  // Second shelf, right under Jump Back In (or first, when there's no history yet).
  const servicesRow = (
    <ServicesRow
      services={musicServices.services}
      isLoading={musicServices.isLoading}
      isSyncing={musicServices.isSyncing}
      syncError={musicServices.syncError}
      onSelectService={handleSelectService}
      onSynchronize={musicServices.synchronize}
      focusServiceId={returnFocusServiceId}
      isFirst={!isEmpty && quickAccess.length === 0}
      testID="home-services-row"
    />
  );

  return (
    <View style={styles.container}>
      {/* display:none (not unmount) keeps scroll position and drops the shelves from D-pad focus search. */}
      <ScrollView
        ref={scrollRef}
        style={[styles.container, openServiceCtx && styles.hidden]}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <>
            <View style={styles.homeEmptyContainer} testID="home-empty-state">
              <Text style={styles.homeEmptyTitle}>Ready to Play</Text>
              <Text style={styles.homeEmptySubtitle}>
                Browse Favorites, search music services, or stream directly to this speaker from the Sonos app.
              </Text>
            </View>
            {servicesRow}
          </>
      ) : (
        <>
          {/* Jump Back In: the last-played items from local playback history, 2x3 grid */}
          {quickAccess.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Jump Back In</Text>
              </View>

              <View style={styles.quickAccessGrid}>
                {quickAccess.map((item) => (
                  <TVFocusableCard
                    key={item.id}
                    onPress={() => handlePlay(item)}
                    style={styles.quickAccessCard}
                    testID={`quick-access-${item.id}`}
                  >
                    <View style={styles.quickAccessRow}>
                      <View style={styles.quickAccessImageContainer}>
                        {item.albumArtUri ? (
                          <ArtworkImage
                            uri={item.albumArtUri}
                            title={item.title}
                            style={styles.quickAccessImage}
                          />
                        ) : (
                          <View style={styles.quickAccessPlaceholder}>
                            <Text style={styles.placeholderGlyph}>♪</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.quickAccessTextCol}>
                        <Text style={styles.quickAccessTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.subtitle && (
                          <Text style={styles.quickAccessSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TVFocusableCard>
                ))}
              </View>
            </>
          )}

          {servicesRow}

          {/* Sonos Favorites Horizontal Swimlane (full list lives in the Favorites tab) */}
          {favorites.length > 0 && (
            <>
              <View style={styles.sectionHeaderSubsequent}>
                <Text style={styles.sectionTitle}>Favorites</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.swimlaneContainer}
              >
                {favorites.map((item) => (
                  <TVFocusableCard
                    key={item.id}
                    onPress={() => handlePlay(item)}
                    style={styles.squareCard}
                    testID={`favorite-${item.id}`}
                  >
                    <View style={styles.squareImageContainer}>
                      <ArtworkImage
                        uri={item.albumArtUri}
                        title={item.title}
                        style={styles.squareImage}
                        fontSize={28}
                      />
                    </View>
                    <View style={styles.squareTextContainer}>
                      <Text style={styles.squareTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.squareSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </TVFocusableCard>
                ))}
              </ScrollView>
            </>
          )}

          {/* Featured Sonos Stations Swimlane */}
          {featuredStations.length > 0 && (
            <>
              <View style={styles.sectionHeaderSubsequent}>
                <Text style={styles.sectionTitle}>Sonos Radio HD & Curated</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.swimlaneContainer}
              >
                {featuredStations.map((item) => (
                  <TVFocusableCard
                    key={item.id}
                    onPress={() => handlePlay(item)}
                    style={styles.squareCard}
                    testID={`station-${item.id}`}
                  >
                    <View style={styles.squareImageContainer}>
                      <ArtworkImage
                        uri={item.albumArtUri}
                        title={item.title}
                        style={styles.squareImage}
                        fontSize={28}
                      />
                    </View>
                    <View style={styles.squareTextContainer}>
                      <Text style={styles.squareTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.squareSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </TVFocusableCard>
                ))}
              </ScrollView>
            </>
          )}
        </>
      )}

      </ScrollView>

      {openServiceCtx && (
        <ServiceBrowseScreen
          speakerIp={speakerIp}
          speakerId={speakerId}
          ctx={openServiceCtx}
          onBack={closeService}
          onFeedback={showToast}
        />
      )}

      {/* Toast feedback (absolute overlay, rendered last so it sits above the browse panel too) */}
      {toastMessage && (
        <View style={[styles.toast, openServiceCtx && styles.toastOverBrowse]} testID="home-toast">
          <View style={styles.toastIndicator} />
          <Text style={styles.toastText} numberOfLines={1}>
            {toastMessage}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 76,
    paddingBottom: spacing.xxl,
  },
  hidden: {
    display: 'none',
  },
  toast: {
    position: 'absolute',
    top: 76,
    left: 36,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  // The browse panel's back button sits where the toast normally does.
  toastOverBrowse: {
    left: undefined,
    right: 36,
  },
  toastIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  toastText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: 0,
    marginBottom: spacing.headerBottom,
    paddingHorizontal: 36,
  },
  sectionHeaderSubsequent: {
    marginTop: spacing.sectionGap,
    marginBottom: 0,
    paddingHorizontal: 36,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },
  quickAccessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: 36,
    marginBottom: 0,
  },
  quickAccessCard: {
    width: '31.8%',
    minWidth: 240,
    padding: 0,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  quickAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
  },
  quickAccessImageContainer: {
    width: 64,
    height: 64,
    backgroundColor: colors.surfaceElevated,
  },
  quickAccessImage: {
    width: '100%',
    height: '100%',
  },
  quickAccessPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  placeholderGlyph: {
    fontSize: 24,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  quickAccessTextCol: {
    flex: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  quickAccessTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  quickAccessSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  swimlaneContainer: {
    paddingLeft: 36,
    paddingRight: 64,
    // Room for TVFocusableCard's 1.04 focus scale; replaces the header's bottom margin so the gap matches Jump Back In.
    paddingTop: spacing.headerBottom,
    paddingBottom: 12,
    gap: spacing.md,
  },
  squareCard: {
    width: 168,
    padding: 0,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  squareImageContainer: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  squareImage: {
    width: '100%',
    height: '100%',
  },
  squareTextContainer: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 58,
    justifyContent: 'center',
  },
  squareTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  squareSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  homeEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 48,
  },
  homeEmptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  homeEmptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 500,
    lineHeight: 22,
  },
});

