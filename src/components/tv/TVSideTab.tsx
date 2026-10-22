import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme';
import { NotificationDot } from '../common/NotificationDot';

export interface TVSideTabProps {
  label: string;
  active?: boolean;
  showBadge?: boolean;
  /** Side rails select on focus, like the Android TV settings panel. */
  onFocus?: () => void;
  onPress?: () => void;
  testID?: string;
}

/**
 * One entry of a vertical side-tab rail: plain text when idle, a soft fill
 * when it's the selected section, solid white with dark text under the
 * D-pad cursor — the same focus treatment as TopBar's tabs.
 */
export const TVSideTab: React.FC<TVSideTabProps> = ({
  label,
  active = false,
  showBadge = false,
  onFocus,
  onPress,
  testID,
}) => {
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={showBadge ? t('common.newBadge', { label }) : label}
      testID={testID}
      onFocus={() => {
        setIsFocused(true);
        onFocus?.();
      }}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={[styles.tab, active && styles.activeTab, isFocused && styles.focusedTab]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, active && styles.activeLabel, isFocused && styles.focusedLabel]}
      >
        {label}
      </Text>
      {showBadge ? <NotificationDot /> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  focusedTab: {
    backgroundColor: colors.focusBackground,
    transform: [{ scale: 1.03 }],
  },
  label: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  activeLabel: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  focusedLabel: {
    color: colors.focusText,
    fontWeight: '600',
  },
});
