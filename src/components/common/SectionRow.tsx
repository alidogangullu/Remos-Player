import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { colors, spacing } from '../../theme';

export interface SectionRowProps {
  title: string;
  subtitle?: string;
  onPressMore?: () => void;
  loading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** First section on screen gets no top margin; subsequent ones get `spacing.sectionGap`. */
  isFirst?: boolean;
  /** Left inset of the header and swimlane — lets a host pane line the section up with its own content. */
  leadingInset?: number;
  children: React.ReactNode;
  testID?: string;
}

/**
 * "Title … More >" header + horizontal swimlane. Extracted from the block
 * duplicated twice in `HomeScreen.tsx` ("Recently Played", "Sonos Radio HD
 * & Curated") so search-result sections and service-panel rows reuse the
 * same shell instead of a third copy.
 */
export const SectionRow: React.FC<SectionRowProps> = ({
  title,
  subtitle,
  onPressMore,
  loading,
  errorMessage,
  onRetry,
  isFirst,
  leadingInset = DEFAULT_LEADING_INSET,
  children,
  testID,
}) => {
  const inset = { paddingLeft: leadingInset };
  return (
    <View style={[styles.section, !isFirst && styles.sectionSubsequent]} testID={testID}>
      <View style={[styles.header, inset]}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onPressMore && (
          <Pressable onPress={onPressMore} hitSlop={8}>
            <Text style={styles.more}>More &gt;</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={[styles.loadingRow, inset]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : errorMessage ? (
        <View style={[styles.errorRow, inset]}>
          <Text style={styles.errorText} numberOfLines={1}>
            {errorMessage}
          </Text>
          {onRetry && (
            <Pressable onPress={onRetry} hitSlop={8}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.swimlane, inset]}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
};

const DEFAULT_LEADING_INSET = 36;

const styles = StyleSheet.create({
  section: {
    marginTop: 0,
  },
  sectionSubsequent: {
    marginTop: spacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    marginBottom: spacing.headerBottom,
  },
  headerTextCol: {
    flexShrink: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  more: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  swimlane: {
    paddingLeft: 36,
    paddingRight: 64,
    // Focused cards scale up (TVFocusableCard's focusedCard transform) —
    // without top room, the top row's focused card overflows past this
    // ScrollView's own bounding box and gets clipped by it (see the same
    // fix on ServiceBrowseScreen's grid/list containers).
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  loadingRow: {
    height: 168,
    justifyContent: 'center',
    paddingLeft: 36,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 36,
    height: 48,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.statusError,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
});
