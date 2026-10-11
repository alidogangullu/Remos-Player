import { StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme';

/** Layout shared by the panes shown right of the settings rail. */
export const paneStyles = StyleSheet.create({
  // Left padding is the gap to the rail; right padding is the screen-edge margin.
  scroll: {
    flex: 1,
    paddingLeft: 36,
    paddingRight: 36,
  },
  // Clears the absolutely positioned TopBar.
  content: {
    paddingTop: 76,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  bodyText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  mutedText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
