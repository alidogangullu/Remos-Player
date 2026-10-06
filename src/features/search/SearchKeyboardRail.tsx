import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { TVKeyboard, KEYBOARD_WIDTH } from '../../components/tv';
import { colors, spacing } from '../../theme';

/** Rail width: the keyboard grid plus the gutter between it and the results pane. */
export const RAIL_WIDTH = KEYBOARD_WIDTH + spacing.lg;

/** How long the "Clear" button stays armed as "Confirm?" before reverting. */
const CLEAR_CONFIRM_TIMEOUT_MS = 2000;

export interface SearchKeyboardRailProps {
  query: string;
  onChangeQuery: (query: string) => void;
  recentSearches: string[];
  onSelectRecent: (term: string) => void;
  onClearRecent?: () => void;
  /** Fired on any keyboard focus movement, so the search can wait for real idle instead of a fixed timer. */
  onKeyboardNavigate?: () => void;
  testID?: string;
}

/**
 * Left rail of the split search layout: the query line, the on-screen
 * D-pad keyboard, and recent searches. The keyboard is always visible —
 * results in `SearchResultsPane` update live as the query changes, so
 * there is no separate "submit" step.
 */
export const SearchKeyboardRail: React.FC<SearchKeyboardRailProps> = ({
  query,
  onChangeQuery,
  recentSearches,
  onSelectRecent,
  onClearRecent,
  onKeyboardNavigate,
  testID,
}) => {
  const handleKeyPress = (char: string) => onChangeQuery(query + char);
  const handleBackspace = () => onChangeQuery(query.slice(0, -1));
  const handleClear = () => onChangeQuery('');

  const [clearArmed, setClearArmed] = useState(false);
  const clearArmedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearArmedTimeoutRef.current) clearTimeout(clearArmedTimeoutRef.current);
    };
  }, []);

  const handleClearRecentPress = () => {
    if (!clearArmed) {
      setClearArmed(true);
      clearArmedTimeoutRef.current = setTimeout(() => setClearArmed(false), CLEAR_CONFIRM_TIMEOUT_MS);
      return;
    }
    if (clearArmedTimeoutRef.current) clearTimeout(clearArmedTimeoutRef.current);
    setClearArmed(false);
    onClearRecent?.();
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.queryLine} testID="search-query-line">
        {query.length > 0 ? (
          <>
            <Text style={styles.queryText} numberOfLines={1}>
              {query}
            </Text>
            <View style={styles.cursor} />
          </>
        ) : (
          <Text style={styles.queryPlaceholder} numberOfLines={1}>
            Search
          </Text>
        )}
      </View>

      <TVKeyboard
        onKeyPress={handleKeyPress}
        onBackspace={handleBackspace}
        onClear={handleClear}
        onNavigate={onKeyboardNavigate}
        testID="search-keyboard"
      />

      {recentSearches.length > 0 && (
        <View style={styles.recentContainer}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>RECENT SEARCHES</Text>
            <Pressable
              onPress={handleClearRecentPress}
              style={({ pressed, focused }) => [
                styles.clearButton,
                focused && styles.clearButtonFocused,
                pressed && styles.recentRowPressed,
              ]}
              testID="recent-searches-clear"
            >
              {({ focused }) => (
                <Text
                  style={[
                    styles.clearButtonText,
                    focused && styles.clearButtonTextFocused,
                    clearArmed && !focused && styles.clearButtonTextArmed,
                  ]}
                >
                  {clearArmed ? 'Confirm?' : 'Clear'}
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {recentSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => onSelectRecent(term)}
                style={({ pressed, focused }) => [
                  styles.recentRow,
                  focused && styles.recentRowFocused,
                  pressed && styles.recentRowPressed,
                ]}
                testID={`recent-search-${term}`}
              >
                {({ focused }) => (
                  <>
                    <Text style={[styles.recentBullet, focused && styles.recentTextFocused]}>·</Text>
                    <Text
                      style={[styles.recentText, focused && styles.recentTextFocused]}
                      numberOfLines={1}
                    >
                      {term}
                    </Text>
                  </>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Fixed width (content-sized to the keyboard grid), not a percentage.
    // Percentage splits (rail 30% / pane 70%) left an unexplained ~36px gap
    // on the far right of the results pane — its box consistently measured
    // short of the screen edge by exactly the outer padding amount. Now
    // that the keyboard itself is a fixed `KEYBOARD_WIDTH`, the rail can
    // just be that plus padding, and the results pane takes `flex: 1` as
    // the row's only growing child — with nothing competing for growth,
    // Yoga gives it 100% of whatever space remains, sidestepping both the
    // percentage-box issue and the original `flexBasis: 'auto'` bug (which
    // only bit when two flex-grow siblings competed for space).
    width: RAIL_WIDTH,
    flexShrink: 0,
    paddingRight: spacing.md,
  },
  queryLine: {
    // Matches the keyboard grid's own width exactly (`KEYBOARD_WIDTH`)
    // instead of stretching to the rail's full width — otherwise this and
    // the recent searches end further right than the letter grid.
    width: KEYBOARD_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  queryText: {
    // Shrinks (not grows) so the cursor sits right after the last character.
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  queryPlaceholder: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textMuted,
  },
  cursor: {
    width: 2,
    height: 20,
    marginLeft: 1,
    backgroundColor: colors.primary,
  },
  recentContainer: {
    width: KEYBOARD_WIDTH,
    marginTop: spacing.md,
    flexShrink: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    // Uppercase is written into the label: textTransform follows the device
    // locale, which turns "i" into "İ" on a Turkish TV.
    letterSpacing: 0.4,
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    minHeight: 28,
    justifyContent: 'center',
  },
  clearButtonFocused: {
    backgroundColor: colors.focusBackground,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  clearButtonTextFocused: {
    color: colors.focusText,
  },
  clearButtonTextArmed: {
    color: colors.primary,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    gap: spacing.sm,
  },
  recentRowFocused: {
    backgroundColor: colors.focusBackground,
  },
  recentRowPressed: {
    opacity: 0.8,
  },
  recentBullet: {
    color: colors.textMuted,
    fontSize: 14,
  },
  recentText: {
    fontSize: 14,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  recentTextFocused: {
    color: colors.focusText,
    fontWeight: '700',
  },
});
