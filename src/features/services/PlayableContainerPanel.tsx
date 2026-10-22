import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { toDisplayUpperCase } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { ArtworkImage } from '../../components/common';
import { PlayIcon, PlayNextIcon, AddToQueueIcon, ReplaceQueueIcon } from '../../components/common/QueueActionIcons';
import { TVActionButton } from '../../components/tv';
import { MediaCollection } from '../../services/sonos/smapi/smapiTypes';
import { colors, spacing } from '../../theme';

export type ContainerAction = 'playNow' | 'playNext' | 'addToEnd' | 'replaceQueue';

export interface PlayableContainerPanelProps {
  item: MediaCollection;
  serviceName: string;
  /** Number of entries in the container, once its contents have loaded. */
  totalItems?: number;
  onAction: (action: ContainerAction) => void;
}

/** SMAPI itemType → services.itemTypes key. */
const ITEM_TYPE_KEYS = {
  playlist: 'playlist',
  album: 'album',
  artist: 'artist',
  program: 'station',
  stream: 'station',
  favorites: 'collection',
} as const;

function itemTypeKey(itemType: string | undefined) {
  const type = itemType?.toLowerCase();
  return type && type in ITEM_TYPE_KEYS ? ITEM_TYPE_KEYS[type as keyof typeof ITEM_TYPE_KEYS] : undefined;
}

/** Fixed so the track list beside it gets every remaining pixel. */
export const PLAYABLE_PANEL_WIDTH = 232;
/**
 * Artwork and every action button share this width, so the panel reads as one
 * column. Sized for the longest label ("Replace Queue") plus its icon.
 */
const COLUMN_WIDTH = 168;
const ACTION_ICON_SIZE = 18;

/**
 * Left half of a playable container's page (playlist, album, "Songs"…):
 * artwork, title and the queue actions stacked vertically, with the
 * contents listed to its right. Opening the container lands D-pad focus on
 * Play, so "open and play" is two presses; Right moves into the list.
 */
export const PlayableContainerPanel: React.FC<PlayableContainerPanelProps> = ({
  item,
  serviceName,
  totalItems,
  onAction,
}) => {
  const { t } = useTranslation();
  const typeKey = itemTypeKey(item.itemType);
  // Uppercased here, not via textTransform (Android would apply the device locale).
  // The type label follows the app language's casing; the service name is a brand
  // and keeps English casing, so a Turkish UI shows "APPLE MUSIC", not "APPLE MUSİC".
  const eyebrow = [
    typeKey ? toDisplayUpperCase(t(`services.itemTypes.${typeKey}`)) : undefined,
    serviceName.toLocaleUpperCase('en-US'),
  ]
    .filter(Boolean)
    .join(' · ');
  const countLabel =
    totalItems !== undefined && totalItems > 0 ? t('services.itemCount', { count: totalItems }) : null;

  return (
    // Scrolls only when a two-line title pushes the last button past the TV's
    // bottom edge; focusing it then brings it into view.
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="playable-container-panel"
    >
      <ArtworkImage uri={item.albumArtUri} title={item.title} style={styles.artwork} fontSize={32} />
      <Text style={styles.eyebrow} numberOfLines={1}>
        {eyebrow}
      </Text>
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
      {/* Reserves its line while loading so the buttons don't jump. */}
      <Text style={styles.meta} numberOfLines={1}>
        {countLabel ?? ' '}
      </Text>
      <View style={styles.actions}>
        <TVActionButton
          label={t('services.actions.play')}
          variant="primary"
          renderIcon={(color) => <PlayIcon color={color} size={ACTION_ICON_SIZE} />}
          onPress={() => onAction('playNow')}
          hasTVPreferredFocus
          style={[styles.actionButton, styles.playButton]}
          testID="action-play-now"
        />
        <TVActionButton
          label={t('services.actions.playNext')}
          renderIcon={(color) => <PlayNextIcon color={color} size={ACTION_ICON_SIZE} />}
          onPress={() => onAction('playNext')}
          variant="ghost"
          style={[styles.actionButton, styles.ghostButton]}
          testID="action-play-next"
        />
        <TVActionButton
          label={t('services.actions.addToQueue')}
          renderIcon={(color) => <AddToQueueIcon color={color} size={ACTION_ICON_SIZE} />}
          onPress={() => onAction('addToEnd')}
          variant="ghost"
          style={[styles.actionButton, styles.ghostButton]}
          testID="action-add-to-end"
        />
        <TVActionButton
          label={t('services.actions.replaceQueue')}
          renderIcon={(color) => <ReplaceQueueIcon color={color} size={ACTION_ICON_SIZE} />}
          onPress={() => onAction('replaceQueue')}
          variant="ghost"
          style={[styles.actionButton, styles.ghostButton]}
          testID="action-replace-queue"
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    // Widened by the content's side padding and pulled back by it, so the
    // column itself stays where it was.
    width: PLAYABLE_PANEL_WIDTH + spacing.xs * 2,
    marginHorizontal: -spacing.xs,
  },
  content: {
    // Room for the focused button's scale, and to scroll the last one clear of the TV edge.
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.lg,
  },
  artwork: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH,
    borderRadius: 10,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: 12,
  },
  actionButton: {
    width: COLUMN_WIDTH,
    minWidth: 0,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
  },
  playButton: {
    height: 40,
    // Separates the primary action from the quieter queue actions below it.
    marginBottom: spacing.xs,
  },
  ghostButton: {
    // Kept compact: the larger artwork already costs the panel vertical room.
    height: 36,
  },
});
