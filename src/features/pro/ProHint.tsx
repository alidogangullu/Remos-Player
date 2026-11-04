import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { ProBadge } from './ProBadge';

export interface ProHintProps {
  text: string;
  style?: StyleProp<ViewStyle>;
}

/** One quiet line on a Pro screen a free user is looking around: what needs Pro there. Not focusable. */
export const ProHint: React.FC<ProHintProps> = ({ text, style }) => {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, style]}>
      <ProBadge label={t('pro.badge')} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
});
