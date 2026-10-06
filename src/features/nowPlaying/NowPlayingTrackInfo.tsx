import React from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

export interface TrackDisplayInfo {
  title?: string;
  artist?: string;
  album?: string;
  albumArtUri?: string;
  format?: string;
}

interface NowPlayingTrackInfoProps {
  track: TrackDisplayInfo | null | undefined;
  scaleAnim?: Animated.Value;
  align?: 'center' | 'flex-start';
  isTvAudio?: boolean;
  /** Live radio: a LIVE badge replaces the audio-format badge. */
  isLive?: boolean;
  style?: any;
}

export const ARTWORK_SIZE = 260;

export const NowPlayingTrackInfo: React.FC<NowPlayingTrackInfoProps> = ({
  track,
  scaleAnim,
  align = 'center',
  isTvAudio = false,
  isLive = false,
  style,
}) => {
  const containerStyle = [
    styles.container,
    align === 'flex-start' && styles.alignStart,
    style,
  ];

  if (isTvAudio) {
    return (
      <View style={containerStyle}>
        <View style={[styles.artworkShadow, styles.tvAudioBox]}>
          <Text style={styles.tvAudioIcon}>TV</Text>
          <Text style={styles.tvAudioBadge}>OPTICAL / EARC</Text>
        </View>
        {/* Invisible metadata keeps the artwork in the same spot as for a normal track. */}
        <View style={[styles.meta, align === 'flex-start' && styles.metaStart, styles.hidden]} importantForAccessibility="no-hide-descendants">
          <Text style={styles.title} numberOfLines={1}> </Text>
          <Text style={styles.artist} numberOfLines={1}> </Text>
          <Text style={styles.album} numberOfLines={1}> </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Animated.View
        style={[
          styles.artworkShadow,
          scaleAnim && { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {track?.albumArtUri ? (
          <Image
            source={{ uri: track.albumArtUri }}
            style={styles.artwork}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]}>
            <Text style={styles.placeholderIcon}>🎵</Text>
          </View>
        )}

        {isLive ? (
          <View style={[styles.formatBadgeContainer, styles.liveBadge]} testID="track-live-badge">
            <View style={styles.liveDot} />
            <Text style={styles.formatBadgeText}>LIVE</Text>
          </View>
        ) : track?.format ? (
          <View style={styles.formatBadgeContainer} testID="track-format-badge">
            <Text style={styles.formatBadgeText}>{track.format}</Text>
          </View>
        ) : null}
      </Animated.View>

      <View style={[styles.meta, align === 'flex-start' && styles.metaStart]}>
        <Text style={styles.title} numberOfLines={1}>
          {track?.title || 'Sonos Speaker Ready'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track?.artist || 'Idle'}
        </Text>
        <Text style={styles.album} numberOfLines={1}>
          {track?.album || ' '}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  artworkShadow: {
    position: 'relative',
    borderRadius: 0,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  artworkPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  placeholderIcon: {
    fontSize: 56,
    opacity: 0.35,
  },
  hidden: {
    opacity: 0,
  },
  tvAudioBox: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    backgroundColor: '#141416',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  tvAudioIcon: {
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  tvAudioBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1.5,
  },
  meta: {
    marginTop: 6,
    alignItems: 'center',
    maxWidth: 580,
    paddingHorizontal: spacing.md,
  },
  metaStart: {
    alignItems: 'flex-start',
    paddingHorizontal: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  artist: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: -2,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  album: {
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  formatBadgeContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.statusError,
  },
  formatBadgeText: {
    // Matches the smallest other caption on this screen; 9 was unreadable from the couch.
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    // No textTransform: 'uppercase' — Android applies the device locale, so on a
    // Turkish TV "bit" became "BİT". Labels carry their own casing ("24-Bit/48 kHz").
    letterSpacing: 0.4,
  },
});
