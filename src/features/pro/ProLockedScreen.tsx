import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../theme';
import { ProFeature } from '../../services/billing/ProProvider';
import { ProUpsell } from './ProUpsell';

export interface ProLockedScreenProps {
  feature: ProFeature;
}

/** Stands in for a Pro tab: says what the tab does instead of hiding it. */
export const ProLockedScreen: React.FC<ProLockedScreenProps> = ({ feature }) => (
  <View style={styles.root} testID={`pro-locked-${feature}`}>
    <ProUpsell feature={feature} layout="wide" />
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPaddingHorizontal + spacing.lg,
    // Clears the absolutely positioned TopBar.
    paddingTop: 76,
    paddingBottom: spacing.xl,
  },
});
