import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { TVFilterChip } from '../../components/tv';
import { SectionRow, ResultCard } from '../../components/common';
import { crossServiceSearch, ServiceSearchResult, SearchResultItem } from '../../services/search/crossServiceSearch';
import { SmapiContext } from '../../services/sonos/smapi/smapiClient';
import { SearchServiceFilterStore } from '../../services/search/searchServiceFilterStore';
import { debounce } from '../../utils/debounce';
import { colors, spacing } from '../../theme';

// `keyboardActivity` (see prop below) re-arms this on every focus move, not
// just on a key press — but the window itself still has to be long enough to
// outlast a normal D-pad think-and-move pause between hops, or it fires
// mid-navigation, before the user has reached the next letter. 500ms was too
// short for that; this needs to comfortably cover "still navigating", not
// just "between React renders".
const SEARCH_DEBOUNCE_MS = 1800;
const MIN_QUERY_LENGTH = 2;
// Left inset of the filter chips: just enough room for their 1.04 focus scale.
const CHIPS_LEADING_INSET = 4;
// Result sections sit a little further from the keyboard than the chips.
const RESULTS_LEADING_INSET = 8;

export interface SearchResultsPaneProps {
  query: string;
  /** Bumped on every keyboard focus movement (not just key presses) — used to
   * push the search debounce back out while the user is still navigating the
   * on-screen keyboard, so it only fires once they've actually stopped. */
  keyboardActivity?: number;
  /** Every searchable linked service; the filter chips pick which of them a search hits. */
  contexts: SmapiContext[];
  isLoadingServices: boolean;
  onSelectResult: (item: SearchResultItem) => void;
  /** Called once a query actually fires a search (after debounce), for recent-searches tracking. */
  onSearchExecuted?: (term: string) => void;
  testID?: string;
}

/**
 * Right pane: service filter chips above grouped-by-service result
 * sections. The chips are always shown — even before typing — and decide
 * which services a search is sent to: multi-select, none selected by
 * default, and with none selected nothing is searched — the pane asks the
 * user to pick a service instead. The selection persists across launches (`SearchServiceFilterStore`). Each
 * service resolves independently — a slow or
 * failing service renders an inline retry row in its own section rather
 * than blocking or blanking the others (see `crossServiceSearch`).
 */
export const SearchResultsPane: React.FC<SearchResultsPaneProps> = ({
  query,
  keyboardActivity,
  contexts,
  isLoadingServices,
  onSelectResult,
  onSearchExecuted,
  testID,
}) => {
  // May hold ids of services since unlinked; everything below intersects it with `contexts`.
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [resultsByService, setResultsByService] = useState<Record<string, ServiceSearchResult>>({});
  const requestTokenRef = useRef(0);
  const onSearchExecutedRef = useRef(onSearchExecuted);
  onSearchExecutedRef.current = onSearchExecuted;
  // The term the results currently on screen (or in flight) actually match.
  // Pure navigation must never schedule a search for a term already covered
  // by this — only an actual change to the query is allowed to do that.
  const lastSearchedTermRef = useRef<string | null>(null);
  // Services already asked about `lastSearchedTermRef` — so turning a chip
  // on only searches services that haven't been, and turning one off and
  // back on reuses its results instead of searching again.
  const requestedServiceIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;
    SearchServiceFilterStore.getSelectedServiceIds().then((ids) => {
      if (isMounted) setSelectedServiceIds(ids);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedContexts = useMemo(
    () => contexts.filter((c) => selectedServiceIds.includes(c.service.serviceId)),
    [contexts, selectedServiceIds],
  );
  // Read when the debounced search actually fires, not when it was armed.
  const selectedContextsRef = useRef(selectedContexts);
  selectedContextsRef.current = selectedContexts;

  const searchServices = (term: string, ctxs: SmapiContext[], token: number) => {
    ctxs.forEach((c) => requestedServiceIdsRef.current.add(c.service.serviceId));
    return crossServiceSearch(term, ctxs, (result) => {
      if (requestTokenRef.current !== token) return; // stale response from a superseded query
      setResultsByService((prev) => ({ ...prev, [result.service.serviceId]: result }));
    });
  };

  const debouncedSearch = useMemo(
    () =>
      debounce((term: string, token: number) => {
        lastSearchedTermRef.current = term;
        requestedServiceIdsRef.current = new Set();
        setResultsByService({});
        onSearchExecutedRef.current?.(term);
        const ctxs = selectedContextsRef.current;
        if (ctxs.length > 0) searchServices(term, ctxs, token);
      }, SEARCH_DEBOUNCE_MS),
    [],
  );

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestTokenRef.current += 1;
      debouncedSearch.cancel();
      lastSearchedTermRef.current = null;
      requestedServiceIdsRef.current = new Set();
      setResultsByService({});
      return;
    }

    // Pure navigation (keyboardActivity changing with the query unchanged)
    // must not schedule anything — only an actual edit to the query is
    // allowed to arm a search. This is what keeps "just moving around the
    // keyboard" from ever re-triggering a search for a term already shown.
    if (trimmed === lastSearchedTermRef.current) {
      return;
    }

    requestTokenRef.current += 1;
    const token = requestTokenRef.current;

    // `keyboardActivity` is still a dependency below: once there IS a real,
    // not-yet-searched query change, further navigation keeps pushing the
    // debounce back out so the search waits for the user to actually stop,
    // instead of firing mid-hop between keys.
    debouncedSearch(trimmed, token);

    return () => debouncedSearch.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, keyboardActivity]);

  // A chip turned on after the current term was searched: search just the
  // newly selected services right away — the others' results still stand.
  useEffect(() => {
    const term = lastSearchedTermRef.current;
    if (term === null || term !== query.trim()) return; // the pending debounced search will cover them
    const missing = selectedContexts.filter((c) => !requestedServiceIdsRef.current.has(c.service.serviceId));
    if (missing.length > 0) searchServices(term, missing, requestTokenRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContexts]);

  const toggleService = (serviceId: string) => {
    const linkedIds = contexts.map((c) => c.service.serviceId);
    const current = selectedServiceIds.filter((id) => linkedIds.includes(id));
    const next = current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId];
    setSelectedServiceIds(next);
    SearchServiceFilterStore.setSelectedServiceIds(next);
  };

  const retryService = (serviceId: string) => {
    const ctx = contexts.find((c) => c.service.serviceId === serviceId);
    const trimmed = query.trim();
    if (!ctx || trimmed.length < MIN_QUERY_LENGTH) return;
    searchServices(trimmed, [ctx], requestTokenRef.current);
  };

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length >= MIN_QUERY_LENGTH;

  let body: React.ReactNode;
  if (isLoadingServices) {
    body = <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />;
  } else if (contexts.length === 0) {
    body = (
      <View style={styles.centeredMessage}>
        <Text style={styles.emptyTitle}>No Services to Search</Text>
        <Text style={styles.emptySubtitle}>
          Synchronize your music services from "Your Services" on Home first.
        </Text>
      </View>
    );
  } else if (selectedContexts.length === 0) {
    body = (
      <View style={styles.centeredMessage}>
        <Text style={styles.emptyTitle}>Select a Service</Text>
        <Text style={styles.emptySubtitle}>Choose one or more services above to search.</Text>
      </View>
    );
  } else if (!hasQuery) {
    body = (
      <View style={styles.centeredMessage}>
        <Text style={styles.emptySubtitle}>Start typing to search.</Text>
      </View>
    );
  } else {
    // The debounced search hasn't actually run for the current text yet (still
    // navigating/typing, or waiting out the settle window) — `resultsByService`
    // still holds whatever the *previous* term left behind. Don't show it as
    // this query's results (stale hits) or read its absence as "no results for
    // this query" (false empty state) until a search has actually run for it.
    const isPendingSearch = trimmedQuery !== lastSearchedTermRef.current;
    const visibleResults = isPendingSearch
      ? []
      : selectedContexts
          .map((c) => resultsByService[c.service.serviceId])
          .filter((r): r is ServiceSearchResult => r !== undefined);
    const totalItems = visibleResults.reduce((sum, r) => sum + r.items.length, 0);
    const stillWaiting = isPendingSearch || visibleResults.length < selectedContexts.length;

    if (totalItems === 0 && !stillWaiting) {
      body = (
        <View style={styles.centeredMessage}>
          <Text style={styles.emptyTitle}>No results for "{trimmedQuery}"</Text>
          <Text style={styles.emptySubtitle}>
            Check the spelling, try fewer words, or search a different service.
          </Text>
        </View>
      );
    } else {
      body = (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sectionsList}>
          {visibleResults.map((result, index) => (
            <SectionRow
              key={result.service.serviceId}
              title={result.service.name}
              subtitle={result.category ? `Category: ${result.category.label}` : undefined}
              isFirst={index === 0}
              leadingInset={RESULTS_LEADING_INSET}
              errorMessage={result.status === 'error' ? result.errorMessage : undefined}
              onRetry={result.status === 'error' ? () => retryService(result.service.serviceId) : undefined}
              testID={`search-section-${result.service.serviceId}`}
            >
              {/* Services can return the same item twice, so ids aren't unique keys. */}
              {result.items.map((item, itemIndex) => (
                <ResultCard
                  key={`${item.id}-${itemIndex}`}
                  title={item.title}
                  subtitle={item.subtitle}
                  albumArtUri={item.albumArtUri}
                  typeBadge={item.kind === 'track' ? 'Track' : undefined}
                  onPress={() => onSelectResult(item)}
                  testID={`search-result-${item.serviceId}-${item.id}`}
                />
              ))}
            </SectionRow>
          ))}
          {stillWaiting && (
            <View style={styles.waitingRow}>
              <Text style={styles.waitingText}>Searching…</Text>
            </View>
          )}
        </ScrollView>
      );
    }
  }

  return (
    <View style={styles.container} testID={testID}>
      {contexts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {contexts.map((ctx) => (
            <TVFilterChip
              key={ctx.service.serviceId}
              label={ctx.service.name}
              active={selectedServiceIds.includes(ctx.service.serviceId)}
              onPress={() => toggleService(ctx.service.serviceId)}
              testID={`search-filter-${ctx.service.serviceId}`}
            />
          ))}
        </ScrollView>
      )}

      {body}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // See SearchKeyboardRail's matching comment — the rail is now a fixed
    // width, so this can simply be `flex: 1` and take all remaining space
    // with no percentage-box ambiguity.
    flex: 1,
  },
  chipsRow: {
    gap: spacing.sm,
    // Room for the chip's 1.04 focus scale, plus a trailing inset — the pane
    // itself bleeds to the screen edge.
    paddingVertical: 4,
    paddingLeft: CHIPS_LEADING_INSET,
    paddingRight: 36,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  loading: {
    marginTop: 80,
  },
  sectionsList: {
    paddingBottom: spacing.xxl,
  },
  centeredMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    // The pane bleeds to the screen edge with no right margin; this keeps
    // the message centered in the visible space, level with the keyboard.
    paddingRight: 24 + 36,
    paddingBottom: 120,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 420,
  },
  waitingRow: {
    paddingVertical: spacing.md,
    paddingLeft: RESULTS_LEADING_INSET,
  },
  waitingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
