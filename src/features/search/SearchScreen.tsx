import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { useToast } from '../../components/common';

const TAG = 'SearchScreen';

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
  const { t } = useTranslation();
  const toast = useToast();
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

  const handleSelectResult = async (item: SearchResultItem) => {
    const ctx = searchableContexts.find((c) => c.service.serviceId === item.serviceId);
    if (!ctx) return;

    toast.info(t('toast.starting', { title: item.title }));

    try {
      const { uri, metadata } = await playMediaItem(speakerIp, speakerId, ctx, item.raw as MediaMetadata);
      await PlaybackHistoryService.addTrack({
        title: item.title,
        artist: item.subtitle,
        albumArtUri: item.albumArtUri,
        uri,
        metadata,
      });
      toast.success(t('toast.playing', { title: item.title }));
    } catch (error) {
      log.error(TAG, `Failed to play result ${item.id} from ${item.serviceName}`, error);
      toast.error(t('toast.couldntPlay', { title: item.title }));
    }
  };

  return (
    <View style={styles.container} testID="search-screen">
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
});
