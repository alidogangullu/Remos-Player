import React from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { colors } from '../../theme';

export interface ArtworkImageProps {
  /** Album art URL. Empty, missing or non-http values render the fallback. */
  uri?: string;
  /** Used for the fallback initial. */
  title?: string;
  style?: StyleProp<ImageStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  fontSize?: number;
  testID?: string;
}

/**
 * Album artwork with a graceful fallback.
 *
 * React Native warns ("source.uri should not be an empty string") and renders a
 * blank box when given an empty URI, which happens constantly with Sonos
 * favorites and SMAPI results that omit artwork. This renders the title's
 * initial instead.
 */
export const ArtworkImage: React.FC<ArtworkImageProps> = ({
  uri,
  title,
  style,
  fallbackStyle,
  fontSize = 20,
  testID,
}) => {
  const hasArtwork = Boolean(uri && uri.trim().length > 0);

  if (!hasArtwork) {
    return (
      <View style={[styles.fallback, style as StyleProp<ViewStyle>, fallbackStyle]} testID={testID}>
        <Text style={[styles.fallbackText, { fontSize }]}>
          {title ? title.charAt(0).toUpperCase() : '♪'}
        </Text>
      </View>
    );
  }

  return (
    <Image source={{ uri }} style={style} resizeMode="cover" testID={testID} />
  );
};

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBorder,
  },
  fallbackText: {
    fontWeight: '700',
    color: colors.primary,
  },
});
