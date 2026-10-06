import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LyricLine } from '../../services/lyrics/lrcParser';
import { colors, spacing } from '../../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const LINE_HEIGHT = 70;
const LIST_PADDING_TOP = 24;
/**
 * Lines highlight this much ahead of the tracked position, to cover the
 * speaker's output buffering. Was 1000ms while the position itself also
 * lagged by up to a second (whole-second RelTime); that lag is now corrected
 * in NowPlayingScreen, so only the buffering remains.
 */
const LYRICS_LEAD_MS = 500;

interface LyricLineItemProps {
  line: LyricLine;
  isActive: boolean;
}

const LyricLineItem = React.memo(({ line, isActive }: LyricLineItemProps) => {
  const animValue = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isActive ? 1 : 0,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [isActive, animValue]);

  const scale = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.03],
  });

  const opacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });

  const translateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 12],
  });

  return (
    <Animated.View
      style={[
        styles.lineWrapper,
        {
          opacity,
          transform: [{ scale }, { translateX }],
        },
      ]}
    >
      <Text
        style={[styles.lineText, isActive && styles.activeLineText]}
        adjustsFontSizeToFit={true}
        minimumFontScale={0.7}
        allowFontScaling={true}
      >
        {line.text}
      </Text>
    </Animated.View>
  );
});

export interface LyricsViewProps {
  lyrics: LyricLine[];
  currentPositionMs: number;
  isLoading?: boolean;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  lyrics,
  currentPositionMs,
  isLoading = false,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find currently active lyric line based on current position
  const audiblePositionMs = currentPositionMs + LYRICS_LEAD_MS;
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (audiblePositionMs >= lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  useEffect(() => {
    if (activeIndex >= 0 && flatListRef.current && lyrics.length > 0) {
      try {
        flatListRef.current.scrollToIndex({
          index: activeIndex,
          animated: true,
          viewPosition: 0.33,
        });
      } catch {
        // Handled in onScrollToIndexFailed
      }
    }
  }, [activeIndex, lyrics.length]);

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.emptySubtitle}>Loading synced lyrics...</Text>
      </View>
    );
  }

  if (!lyrics || lyrics.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Lyrics Not Available</Text>
        <Text style={styles.emptySubtitle}>
          No synchronized lyrics found for this track.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <FlatList
        ref={flatListRef}
        data={lyrics}
        keyExtractor={(item, index) => `${item.time}-${index}`}
        renderItem={({ item, index }) => (
          <LyricLineItem line={item} isActive={index === activeIndex} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        onScrollToIndexFailed={(info) => {
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            if (flatListRef.current && info.index >= 0 && info.index < lyrics.length) {
              try {
                flatListRef.current.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.33,
                });
              } catch {
                // Ignore
              }
            }
          }, 250);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  listContent: {
    paddingTop: LIST_PADDING_TOP,
    paddingBottom: SCREEN_HEIGHT / 2,
    paddingHorizontal: 16,
  },
  lineWrapper: {
    minHeight: LINE_HEIGHT,
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 12,
  },
  lineText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    opacity: 0.85,
    textAlign: 'left',
    textAlignVertical: 'center',
    letterSpacing: -0.3,
  },
  activeLineText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    opacity: 1,
    textAlign: 'left',
    textAlignVertical: 'center',
    letterSpacing: -0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
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
  },
});
