import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LyricLine } from '../../services/lyrics/lrcParser';
import { colors, spacing } from '../../theme';
import { TVPillButton } from '../../components/tv';
import { ProHint } from '../pro';

/** The song's opening lines a free user reads, each fainter than the last. */
const PREVIEW_LINE_OPACITY = [0.85, 0.5, 0.2];

export interface LyricsPreviewProps {
  lyrics: LyricLine[];
  isLoading?: boolean;
  /** Asks for the full lyrics (opens the Pro upgrade sheet). */
  onShowAll: () => void;
}

/**
 * The lyrics pane for a free user: the song's opening lines, still, fading
 * out, then what Pro adds and a way to get it. Lyrics are only read, so a
 * full view would leave nothing to unlock.
 */
export const LyricsPreview: React.FC<LyricsPreviewProps> = ({ lyrics, isLoading = false, onShowAll }) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.emptySubtitle}>{t('nowPlaying.lyrics.loading')}</Text>
      </View>
    );
  }

  // Timed gaps (instrumental breaks) come through as empty lines.
  const lines = lyrics.filter(line => line.text.trim().length > 0).slice(0, PREVIEW_LINE_OPACITY.length);
  if (lines.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{t('nowPlaying.lyrics.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>{t('nowPlaying.lyrics.emptySubtitle')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="lyrics-preview">
      <View style={styles.lines}>
        {lines.map((line, index) => (
          // Faded by opacity, not a gradient overlay: the artwork-tinted background shows through.
          <Text
            key={`${line.time}-${index}`}
            style={[styles.lineText, { opacity: PREVIEW_LINE_OPACITY[index] }]}
            numberOfLines={2}
          >
            {line.text}
          </Text>
        ))}
      </View>
      <ProHint text={t('pro.hint.lyrics')} style={styles.hint} />
      <TVPillButton
        variant="primary"
        label={t('pro.hint.lyricsCta')}
        onPress={onShowAll}
        style={styles.cta}
        testID="button-lyrics-show-all"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lines: {
    gap: 24,
  },
  // Matches LyricsView's inactive lines, so the preview looks like the real view.
  lineText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  hint: {
    marginTop: spacing.xl,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  centered: {
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
