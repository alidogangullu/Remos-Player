import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export interface AppLogoProps {
  size?: number;
}

/** The Remos tile (amber TV frame on matte dark); outlined so it stays visible on the black UI. */
export const AppLogo: React.FC<AppLogoProps> = ({ size = 96 }) => (
  <Image
    source={require('../../assets/images/logo.png')}
    accessibilityIgnoresInvertColors
    style={[styles.logo, { width: size, height: size, borderRadius: size * 0.22 }]}
    resizeMode="cover"
  />
);

const styles = StyleSheet.create({
  logo: {
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
});
