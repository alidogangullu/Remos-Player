import React, { memo, useCallback, useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View, findNodeHandle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';
import { QueueItem } from '../../services/sonos/upnp/sonosUpnpClient';
import { TVFocusableCard } from '../../components/tv/TVFocusableCard';
import { ArtworkImage } from '../../components/common';
import { colors, spacing } from '../../theme';

const ARTWORK_SIZE = 84;
const CARD_PADDING = 4;
const CARD_WIDTH = ARTWORK_SIZE + CARD_PADDING * 2;
const CARD_GAP = 12;
const ITEM_LENGTH = CARD_WIDTH + CARD_GAP;
const SKELETON_COUNT = 9;

/** How far the shelf rises while the progress bar has focus: the header and the top of the artwork. */
export const SHELF_PEEK_HEIGHT = 60;
export const SHELF_HEIGHT = 184;

/** closed: offscreen. peek: the progress bar has focus. open: a card has focus. */
export type ShelfState = 'closed' | 'peek' | 'open';

export interface QueueShelfProps {
  items: QueueItem[];
  total: number;
  /** Queue position of the playing track; null when the speaker isn't playing the queue. */
  currentTrackNumber: number | null;
  label: string;
  state: ShelfState;
  isLoading: boolean;
  /** ↑ from any card goes back to the progress bar. */
  progressBarNode: number | null;
  /** Reports the card that ↓ from the progress bar should land on. */
  onTargetNode: (node: number | null) => void;
  onSelect: (item: QueueItem) => void;
  onEndReached: () => void;
  onCardFocus: () => void;
  onCardBlur: () => void;
}

type CardRole = 'played' | 'current' | 'upcoming';

interface QueueShelfCardProps {
  item: QueueItem;
  role: CardRole;
  focusable: boolean;
  nextFocusUp?: number;
  cardRef?: React.Ref<View>;
  onSelect: (item: QueueItem) => void;
  onFocus: () => void;
  onBlur: () => void;
}

const NowPlayingGlyph: React.FC = () => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill={colors.primary}>
    <Rect x={1} y={4} width={2.2} height={7} rx={1.1} />
    <Rect x={4.9} y={1} width={2.2} height={10} rx={1.1} />
    <Rect x={8.8} y={6} width={2.2} height={5} rx={1.1} />
  </Svg>
);

const QueueShelfCard: React.FC<QueueShelfCardProps> = memo(({
  item,
  role,
  focusable,
  nextFocusUp,
  cardRef,
  onSelect,
  onFocus,
  onBlur,
}) => {
  const { t } = useTranslation();
  const isCurrent = role === 'current';

  return (
    <TVFocusableCard
      ref={cardRef}
      style={styles.card}
      focusable={focusable}
      nextFocusUp={nextFocusUp}
      onPress={() => onSelect(item)}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityLabel={
        isCurrent
          ? t('nowPlaying.queue.current', { title: item.title, artist: item.artist })
          : `${item.title}, ${item.artist}`
      }
      testID={`queue-item-${item.trackNumber}`}
    >
      {/* Dims the content, not the card, so the focus ring stays at full strength. */}
      <View style={role === 'played' && styles.played}>
        <View>
          <ArtworkImage uri={item.albumArtUri} title={item.title} style={styles.artwork} fontSize={28} />
          {isCurrent && (
            <View style={styles.nowPlayingBadge}>
              <NowPlayingGlyph />
            </View>
          )}
        </View>
        <Text style={[styles.title, isCurrent && styles.titleCurrent]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
    </TVFocusableCard>
  );
});

export const QueueShelf: React.FC<QueueShelfProps> = ({
  items,
  total,
  currentTrackNumber,
  label,
  state,
  isLoading,
  progressBarNode,
  onTargetNode,
  onSelect,
  onEndReached,
  onCardFocus,
  onCardBlur,
}) => {
  const { t } = useTranslation();
  const listRef = useRef<FlatList<QueueItem>>(null);

  const activeIndex =
    currentTrackNumber === null ? -1 : items.findIndex((item) => item.trackNumber === currentTrackNumber);
  // ↓ from the bar lands on the next track (the current one if it's the last).
  const targetIndex = activeIndex >= 0 ? Math.min(activeIndex + 1, items.length - 1) : 0;
  const anchorIndex = Math.max(0, activeIndex);
  const cardsFocusable = state !== 'closed';

  // Keep the playing track at the left edge, except while the user is browsing.
  useEffect(() => {
    if (state === 'open' || items.length === 0) return;
    listRef.current?.scrollToIndex({ index: anchorIndex, animated: state === 'peek' });
  }, [state, anchorIndex, items.length]);

  const reportTarget = useCallback(
    (view: View | null) => {
      onTargetNode(view ? findNodeHandle(view) : null);
    },
    [onTargetNode],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: QueueItem; index: number }) => {
      let role: CardRole = 'upcoming';
      if (index === activeIndex) role = 'current';
      else if (index < activeIndex) role = 'played';
      return (
        <QueueShelfCard
          item={item}
          role={role}
          focusable={cardsFocusable}
          nextFocusUp={progressBarNode ?? undefined}
          cardRef={index === targetIndex ? reportTarget : undefined}
          onSelect={onSelect}
          onFocus={onCardFocus}
          onBlur={onCardBlur}
        />
      );
    },
    [activeIndex, targetIndex, cardsFocusable, progressBarNode, reportTarget, onSelect, onCardFocus, onCardBlur],
  );

  let body: React.ReactNode;
  if (items.length > 0) {
    body = (
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialScrollIndex={anchorIndex}
        initialNumToRender={12}
        getItemLayout={(_, index) => ({ length: ITEM_LENGTH, offset: ITEM_LENGTH * index, index })}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
      />
    );
  } else if (isLoading) {
    body = (
      <View style={[styles.listContent, styles.skeletonRow]}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <View key={i} style={styles.skeletonCard}>
            <View style={styles.skeletonArtwork} />
          </View>
        ))}
      </View>
    );
  } else {
    body = <Text style={styles.emptyText}>{t('nowPlaying.queue.empty')}</Text>;
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {currentTrackNumber !== null && total > 0 && (
          <Text style={styles.position}>
            {t('nowPlaying.queue.position', { current: currentTrackNumber, total })}
          </Text>
        )}
      </View>
      {body}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    height: SHELF_HEIGHT,
    paddingTop: spacing.sm,
    // Continues the footer scrim's darkest stop.
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  header: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  position: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  listContent: {
    // Room for the focus zoom; the left edge lines up with the controls above.
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl - CARD_PADDING,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: CARD_GAP,
    padding: CARD_PADDING,
    backgroundColor: 'transparent',
  },
  played: {
    opacity: 0.45,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 6,
    marginBottom: 6,
  },
  nowPlayingBadge: {
    position: 'absolute',
    left: 5,
    bottom: 11,
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  title: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  titleCurrent: {
    color: colors.primary,
  },
  artist: {
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
  skeletonCard: {
    width: CARD_WIDTH,
    marginRight: CARD_GAP,
    padding: CARD_PADDING,
  },
  skeletonArtwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyText: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
