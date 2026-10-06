import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme';
import { SearchKeyboardRail } from './SearchKeyboardRail';
import { SearchResultsPane } from './SearchResultsPane';
import { RecentSearchesStore } from '../../services/search/recentSearchesStore';
import { buildSearchableSmapiContexts } from '../../services/sonos/smapi/smapiContextBuilder';
import { SmapiContext } from '../../services/sonos/smapi/smapiClient';
import { playMediaItem } from '../../services/sonos/smapi/playMediaItem';
import { MediaMetadata } from '../../services/sonos/smapi/smapiTypes';
import { PlaybackHistoryService } from '../../services/history/playbackHistoryService';
import { SearchResultItem } from '../../services/search/crossServiceSearch';
import { log } from '../../utils/logger';

const TAG = 'SearchScreen';
const TOAST_DURATION_MS = 3000;

export interface SearchScreenProps {
  speakerIp: string;
  speakerId: string;
  /** False while the tab is kept mounted but hidden. Becoming active re-reads
   * the searchable services, since they're synchronized from Home. */
  isActive?: boolean;
}

/**
 * Split-layout search: keyboard + recent searches on the left; on the right,
 * service filter chips (which services to search — choosable before typing)
 * above the live cross-service results. Browsing a single service lives on
 * Home's "Your Services" shelf.
 */
export const SearchScreen: React.FC<SearchScreenProps> = ({ speakerIp, speakerId, isActive = true }) => {
  const [query, setQuery] = useState('');
  // Bumped on every keyboard focus movement (not just key presses), so the
  // results pane can wait for real idle instead of a fixed post-keystroke timer.
  const [keyboardActivity, setKeyboardActivity] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchableContexts, setSearchableContexts] = useState<SmapiContext[]>([]);
  const [isLoadingContexts, setIsLoadingContexts] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const refreshRecent = useCallback(async () => {
    const recent = await RecentSearchesStore.getRecentSearches();
    if (isMountedRef.current) setRecentSearches(recent);
  }, []);

  const refreshContexts = useCallback(async () => {
    if (!speakerIp) return;
    try {
      const searchable = await buildSearchableSmapiContexts(speakerIp);
      if (isMountedRef.current) setSearchableContexts(searchable);
    } catch (error) {
      log.error(TAG, 'Failed to build SMAPI contexts', error);
    } finally {
      if (isMountedRef.current) setIsLoadingContexts(false);
    }
  }, [speakerIp]);

  useEffect(() => {
    isMountedRef.current = true;
    refreshRecent();
    refreshContexts();
    return () => {
      isMountedRef.current = false;
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerIp]);

  // "Synchronize Music Services" runs from Home, so pick up its result
  // whenever this tab comes back into view.
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) refreshContexts();
    wasActiveRef.current = isActive;
  }, [isActive, refreshContexts]);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
  };

  const handleSelectResult = async (item: SearchResultItem) => {
    const ctx = searchableContexts.find((c) => c.service.serviceId === item.serviceId);
    if (!ctx) return;

    showToast(`Now Playing: ${item.title}`);

    try {
      const { uri, metadata } = await playMediaItem(speakerIp, speakerId, ctx, item.raw as MediaMetadata);
      await PlaybackHistoryService.addTrack({
        title: item.title,
        artist: item.subtitle,
        albumArtUri: item.albumArtUri,
        uri,
        metadata,
      });
    } catch (error) {
      log.error(TAG, `Failed to play result ${item.id} from ${item.serviceName}`, error);
      showToast(`Couldn't play "${item.title}"`);
    }
  };

  return (
    <View style={styles.container} testID="search-screen">
      {toastMessage && (
        <View style={styles.toast} testID="search-toast">
          <View style={styles.toastIndicator} />
          <Text style={styles.toastText} numberOfLines={1}>
            {toastMessage}
          </Text>
        </View>
      )}
      <View style={styles.content}>
        <SearchKeyboardRail
          query={query}
          onChangeQuery={setQuery}
          recentSearches={recentSearches}
          onSelectRecent={setQuery}
          onClearRecent={() => RecentSearchesStore.clear().then(refreshRecent)}
          onKeyboardNavigate={() => setKeyboardActivity((n) => n + 1)}
          testID="search-keyboard-rail"
        />
        <SearchResultsPane
          query={query}
          keyboardActivity={keyboardActivity}
          contexts={searchableContexts}
          isLoadingServices={isLoadingContexts}
          onSelectResult={handleSelectResult}
          onSearchExecuted={(term) => RecentSearchesStore.addSearch(term).then(refreshRecent)}
          testID="search-results-pane"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 76,
    // No paddingRight: the results pane (horizontal-scrolling rows) must bleed to the true right edge of the screen —
    // a reserved right margin here left dead space before the screen edge,
    // making the carousel look like it stopped short instead of scrolling
    // further. Individual non-scrolling elements (header buttons, chip
    // rows) add their own trailing inset instead.
    paddingLeft: 32,
  },
  toast: {
    position: 'absolute',
    top: spacing.lg,
    right: 36,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.statusPlaying,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  toastIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.statusPlaying,
  },
  toastText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
