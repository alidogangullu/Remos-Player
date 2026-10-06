import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TVFocusGuideView } from 'react-native';
import { ServiceNavRow } from './ServiceNavRow';
import { TrackListRow } from './TrackListRow';
import { PlayableContainerPanel, ContainerAction } from './PlayableContainerPanel';
import { TVFocusableButton, TVFocusableCard } from '../../components/tv';
import { getMetadata, SmapiContext } from '../../services/sonos/smapi/smapiClient';
import { fetchBrowseRoot, hasBrowseApi } from '../../services/sonos/smapi/serviceBrowseApi';
import { buildContainerPlaybackTarget } from '../../services/sonos/smapi/containerPlaybackUri';
import { playMediaItem } from '../../services/sonos/smapi/playMediaItem';
import { GetMetadataResult, MediaCollection, MediaMetadata } from '../../services/sonos/smapi/smapiTypes';
import { SonosUpnpClient } from '../../services/sonos/upnp/sonosUpnpClient';
import { PlaybackHistoryService } from '../../services/history/playbackHistoryService';
import { colors, spacing } from '../../theme';
import { log } from '../../utils/logger';

const TAG = 'ServiceBrowseScreen';
/**
 * The floating TopBar ends at ~59dp. Home's shelves start at 76 because their
 * titles' line-height adds visual air; this page opens on solid shapes (back
 * button, artwork), so it needs a real ~32dp gap below the bar.
 */
const CONTENT_TOP = 92;

export interface ServiceBrowseScreenProps {
  speakerIp: string;
  /** The zone player's RINCON id (`speaker.id`, no "uuid:" prefix) — needed
   * for the `x-rincon-queue:<id>#0` queue URI used by the Play Now/Replace
   * Queue actions. */
  speakerId: string;
  ctx: SmapiContext;
  onBack: () => void;
  /** Short confirmation or failure message for an action (shown as a toast). */
  onFeedback: (message: string) => void;
}

interface StackEntry {
  containerId: string;
  label: string;
  /** Set when the container is itself playable: its page gets the Play/queue header. */
  playable?: MediaCollection;
}

/**
 * A single music service's own panel: root containers (e.g. "Artists /
 * Albums / Songs / Playlists / Recently Added" — supplied by the service
 * itself via `getMetadata(id="root")`, so it differs per service),
 * and drill-down browsing. Searching lives in the Search tab, which can be
 * filtered down to just this service.
 */
export const ServiceBrowseScreen: React.FC<ServiceBrowseScreenProps> = ({
  speakerIp,
  speakerId,
  ctx,
  onBack,
  onFeedback,
}) => {
  const [stack, setStack] = useState<StackEntry[]>([{ containerId: 'root', label: ctx.service.name }]);
  const [result, setResult] = useState<GetMetadataResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Drops repeat presses while a queue action's UPnP calls are still running. */
  const actionInFlightRef = useRef(false);

  const currentEntry = stack.at(-1)!;
  const playable = currentEntry.playable;

  const loadContainer = useCallback(
    async (containerId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        // Root only: prefer the service's own JSON Browse API (personalized
        // shelves, e.g. Apple Music's "For You") when it has one and
        // returns something — matches tvonos (`c.java#k()`). Falls back to
        // plain SMAPI getMetadata otherwise, including when the browse call
        // fails or comes back empty.
        const fromBrowseApi =
          containerId === 'root' && hasBrowseApi(ctx.service.serviceId) ? await fetchBrowseRoot(ctx) : null;
        const fetched = fromBrowseApi ?? (await getMetadata(ctx, containerId));
        setResult(fetched);
      } catch (err) {
        log.error(TAG, `Failed to load container "${containerId}" for ${ctx.service.name}`, err);
        setError('Failed to load this section.');
        setResult(null);
      } finally {
        setIsLoading(false);
      }
    },
    [ctx],
  );

  useEffect(() => {
    loadContainer(currentEntry.containerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry.containerId]);

  /** Every collection opens straight into its contents; playable ones
   * (`canPlay`) get a split page — Play/queue actions on the left, contents
   * on the right — instead of tvonos's pop-up action sheet. */
  const handleSelectCollection = (item: MediaCollection) => {
    setStack((prev) => [
      ...prev,
      { containerId: item.id, label: item.title, playable: item.canPlay ? item : undefined },
    ]);
  };

  /**
   * Plays a single track — same mechanism as container playback
   * (`runContainerAction`'s "Play Now"): a client-built pseudo-URI/DIDL
   * queued via `AddURIToQueue` then jumped to with `seekTrack`, never
   * SMAPI's `getMediaURI` (tvonos doesn't call it for playback at all — see
   * `containerPlaybackUri.ts`).
   */
  const playTrack = async (item: MediaMetadata) => {
    try {
      const { uri, metadata } = await playMediaItem(speakerIp, speakerId, ctx, item);
      await PlaybackHistoryService.addTrack({ title: item.title, artist: item.artist, albumArtUri: item.albumArtUri, uri, metadata });
      onFeedback(`Playing "${item.title}"`);
    } catch (err) {
      log.error(TAG, `Failed to play "${item.title}"`, err);
      onFeedback(`Couldn't play "${item.title}"`);
    }
  };

  /**
   * The four queue actions on a playable container — a literal port of
   * `pb1.java`'s methods, traced exactly via `i2`→`q2`→`pb1` from the
   * decompiled tvonos source (not reconstructed from general UPnP
   * knowledge):
   *   - Play Now  (`i2.P`→`q2.u0`): `pb1.f()` (AddURIToQueue, EnqueueAsNext,
   *     desired = currentTrack+1) → `pb1.f0(firstTrackNumberEnqueued)`
   *     (switch to queue URI if needed, Seek TRACK_NR, Play) — this is
   *     exactly `SonosUpnpClient.seekTrack()`.
   *   - Play Next (`i2.g`→`q2.w0`): same `pb1.f()` call, no follow-up seek.
   *   - Add to End (`i2.x`→`q2.v0`): `pb1.e(0, ...)` (AddURIToQueue,
   *     DesiredFirstTrackNumberEnqueued=0, EnqueueAsNext=false = append).
   *   - Replace Queue (`i2.E`→`q2.J0`): `pb1.h()` (RemoveAllTracksFromQueue)
   *     + `pb1.e(0, ...)` + `pb1.f0(1)`.
   */
  const runContainerAction = async (item: MediaCollection, action: ContainerAction) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const { uri, metadata } = buildContainerPlaybackTarget(ctx, item);

      if (action === 'playNow' || action === 'playNext') {
        const desired = await SonosUpnpClient.getPositionInfo(speakerIp)
          .then((pos) => pos.track + 1)
          .catch(() => 0);
        const { firstTrackNumberEnqueued } = await SonosUpnpClient.addURIToQueue(speakerIp, uri, metadata, desired, true);
        if (action === 'playNow' && firstTrackNumberEnqueued >= 1) {
          await SonosUpnpClient.seekTrack(speakerIp, firstTrackNumberEnqueued, speakerId);
        }
      } else if (action === 'addToEnd') {
        await SonosUpnpClient.addURIToQueue(speakerIp, uri, metadata, 0, false);
      } else {
        await SonosUpnpClient.removeAllTracksFromQueue(speakerIp);
        await SonosUpnpClient.addURIToQueue(speakerIp, uri, metadata, 0, false);
        await SonosUpnpClient.seekTrack(speakerIp, 1, speakerId);
      }

      if (action === 'playNow' || action === 'replaceQueue') {
        await PlaybackHistoryService.addTrack({ title: item.title, albumArtUri: item.albumArtUri, uri, metadata });
        onFeedback(`Playing "${item.title}"`);
      } else if (action === 'playNext') {
        onFeedback(`"${item.title}" will play next`);
      } else {
        onFeedback(`Added "${item.title}" to the queue`);
      }
    } catch (err) {
      log.error(TAG, `Failed to run "${action}" on container "${item.title}"`, err);
      onFeedback(action === 'playNow' || action === 'replaceQueue' ? `Couldn't play "${item.title}"` : "Couldn't update the queue");
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handleBackPress = () => {
    if (stack.length > 1) {
      setStack((prev) => prev.slice(0, -1));
      return;
    }
    onBack();
  };

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{error}</Text>
        <TVFocusableButton label="Retry" onPress={() => loadContainer(currentEntry.containerId)} style={styles.retryButton} />
      </View>
    );
  } else if (playable) {
    body = <ContainerContentsList result={result} onSelectCollection={handleSelectCollection} onPlay={playTrack} />;
  } else {
    body = <ServiceRootList result={result} onSelectCollection={handleSelectCollection} onPlay={playTrack} />;
  }

  const backButton = (
    <TVFocusableCard
      onPress={handleBackPress}
      // A playable container's page starts on its Play button instead.
      hasTVPreferredFocus={!playable}
      style={styles.backButton}
      testID="service-browse-back"
    >
      <Text style={styles.backChevron}>‹</Text>
    </TVFocusableCard>
  );

  if (playable) {
    return (
      <View style={[styles.container, styles.splitContainer]} testID="service-browse-screen">
        {backButton}
        {/* autoFocus: crossing between the halves returns to the last-focused control in each. */}
        <TVFocusGuideView autoFocus>
          <PlayableContainerPanel
            // Remount per container so each one's Play button takes focus on entry.
            key={currentEntry.containerId}
            item={playable}
            serviceName={ctx.service.name}
            totalItems={isLoading || error ? undefined : result?.total}
            onAction={(action) => runContainerAction(playable, action)}
          />
        </TVFocusGuideView>
        <TVFocusGuideView autoFocus style={styles.contentsPane}>
          {body}
        </TVFocusGuideView>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="service-browse-screen">
      <View style={styles.header}>
        {backButton}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentEntry.label}
        </Text>
      </View>

      {body}
    </View>
  );
};

/** Right half of a playable container's page: its contents as one full-width column. */
const ContainerContentsList: React.FC<{
  result: GetMetadataResult | null;
  onSelectCollection: (item: MediaCollection) => void;
  onPlay: (item: MediaMetadata) => void;
}> = ({ result, onSelectCollection, onPlay }) => {
  const collections = result?.mediaCollection ?? [];
  const tracks = result?.mediaMetadata ?? [];
  if (collections.length === 0 && tracks.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nothing here yet.</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.contentsList} showsVerticalScrollIndicator={false}>
      {/* Services can list the same item twice (e.g. a repeated song), so ids aren't unique keys. */}
      {collections.map((item, index) => (
        <TrackListRow
          key={`${item.id}-${index}`}
          title={item.title}
          artworkUri={item.albumArtUri}
          showChevron
          onPress={() => onSelectCollection(item)}
          testID={`service-nav-${item.id}`}
        />
      ))}
      {tracks.map((item, index) => (
        <TrackListRow
          key={`${item.id}-${index}`}
          title={item.title}
          subtitle={[item.artist, item.album].filter(Boolean).join(' · ') || undefined}
          artworkUri={item.albumArtUri}
          durationMs={item.durationMs}
          onPress={() => onPlay(item)}
          testID={`service-nav-${item.id}`}
        />
      ))}
    </ScrollView>
  );
};

const ServiceRootList: React.FC<{
  result: GetMetadataResult | null;
  onSelectCollection: (item: MediaCollection) => void;
  onPlay: (item: MediaMetadata) => void;
}> = ({ result, onSelectCollection, onPlay }) => (
  <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
    {/* Services can list the same item twice (e.g. a repeated song), so ids aren't unique keys. */}
    {(result?.mediaCollection ?? []).map((item, index) => (
      <ServiceNavRow
        key={`${item.id}-${index}`}
        title={item.title}
        iconUri={item.albumArtUri}
        onPress={() => onSelectCollection(item)}
        testID={`service-nav-${item.id}`}
      />
    ))}
    {(result?.mediaMetadata ?? []).map((item, index) => (
      <ServiceNavRow
        key={`${item.id}-${index}`}
        title={item.title}
        iconUri={item.albumArtUri}
        onPress={() => onPlay(item)}
        testID={`service-nav-${item.id}`}
      />
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: CONTENT_TOP,
    paddingHorizontal: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  splitContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  contentsPane: {
    flex: 1,
    alignSelf: 'stretch',
    // Extra breathing room between the action panel and the list.
    marginLeft: spacing.lg,
    // Rows center their 40dp thumbnail in 56dp; pull the list up by that inset
    // so the first thumbnail's top lines up with the panel's artwork.
    marginTop: -8,
  },
  contentsList: {
    gap: 2,
    // No top inset — see `contentsPane`'s marginTop for the alignment with the artwork.
    // Side room is for the rows' focus scale; bottom room scrolls the last row clear of the TV edge.
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    width: 40,
    height: 40,
    padding: 0,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  backChevron: {
    fontSize: 24,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginLeft: -2,
    marginBottom: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    // Rows scale on focus (ServiceNavRow's rowFocused transform) and need
    // side room or the ScrollView clips them.
    padding: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  retryButton: {
    minWidth: 160,
  },
});
