import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TVFocusableButton } from '../../components/tv/TVFocusableButton';
import { colors, spacing } from '../../theme';

export interface SettingsToggleProps {
  title: string;
  description: string;
  isEnabled: boolean;
  actionLabel?: string;
  onToggle: () => void;
  onPress?: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
  title,
  description,
  isEnabled,
  actionLabel,
  onToggle,
  onPress,
  hasTVPreferredFocus,
}) => {
  const handlePress = onPress || onToggle;
  const displayLabel = actionLabel !== undefined ? actionLabel : (isEnabled ? 'ON' : 'OFF');

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <TVFocusableButton
        hasTVPreferredFocus={hasTVPreferredFocus}
        label={displayLabel}
        onPress={handlePress}
        style={[styles.toggleButton, isEnabled && styles.activeButton]}
        textStyle={[styles.toggleText, isEnabled && styles.activeText]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
    minHeight: 92,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  description: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 20,
  },
  toggleButton: {
    minWidth: 96,
    height: 44,
    borderRadius: 22,
  },
  activeButton: {
    borderColor: colors.primary,
  },
  toggleText: {
    color: colors.textSecondary,
  },
  activeText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
