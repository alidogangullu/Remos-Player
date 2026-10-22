import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { formatDate } from '../../i18n';
import { NotificationDot } from '../../components/common';
import { TVFocusableCard } from '../../components/tv';
import { Announcement } from '../../services/remoteConfig/remoteConfigService';
import { paneStyles } from './paneStyles';

const PREVIEW_LINES = 3;

export interface NotificationCardProps {
  item: Announcement;
  isNew: boolean;
  expanded: boolean;
  onToggle: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** A notification collapsed to a short preview; OK expands the full text when it's longer. */
export const NotificationCard: React.FC<NotificationCardProps> = ({
  item,
  isNew,
  expanded,
  onToggle,
  onLayout,
}) => {
  const { t } = useTranslation();
  const [isLong, setIsLong] = useState(false);

  return (
    <View onLayout={onLayout}>
      <TVFocusableCard
        style={styles.card}
        focusScale={1.01}
        onPress={isLong ? onToggle : undefined}
        testID={`notification-${item.id}`}
      >
        <View style={styles.metaRow}>
          {isNew ? <NotificationDot /> : null}
          {isNew ? <Text style={styles.newLabel}>{t('settings.notifications.new')}</Text> : null}
          {item.date ? <Text style={styles.date}>{formatDate(item.date)}</Text> : null}
        </View>
        <Text style={styles.title}>{item.title}</Text>

        <View>
          <Text
            style={paneStyles.bodyText}
            numberOfLines={expanded ? undefined : PREVIEW_LINES}
          >
            {item.body}
          </Text>
          {/* Invisible full-length copy: counts the real lines, since a clamped Text only reports what it shows. */}
          <Text
            style={[paneStyles.bodyText, styles.measure]}
            onTextLayout={e => setIsLong(e.nativeEvent.lines.length > PREVIEW_LINES)}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {item.body}
          </Text>
        </View>

        {isLong ? (
          <Text style={styles.toggleHint}>
            {expanded ? t('settings.notifications.showLess') : t('settings.notifications.readMore')}
          </Text>
        ) : null}
      </TVFocusableCard>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    minHeight: 16,
  },
  newLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  toggleHint: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: colors.textMuted,
  },
});
