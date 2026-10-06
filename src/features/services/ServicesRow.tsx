import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TVFocusGuideView,
} from 'react-native';
import { TVServiceTile, TVFocusableButton } from '../../components/tv';
import { colors, spacing } from '../../theme';
import { LinkedService } from './useMusicServices';

export interface ServicesRowProps {
  services: LinkedService[];
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  onSelectService: (service: LinkedService) => void;
  onSynchronize: () => void;
  /** Service to pull D-pad focus back to (e.g. after closing its browse panel). */
  focusServiceId?: string | null;
  /** Fired when focus enters any control in the shelf — lets the parent scroll it fully into view. */
  onFocusShelf?: () => void;
  /** Top shelf on the page: drops the gap that separates it from a shelf above. */
  isFirst?: boolean;
  testID?: string;
}

/**
 * Home's "Your Services" shelf. Selecting a service opens its own browse
 * panel (`ServiceBrowseScreen`). Services come from `useMusicServices`,
 * which reads whatever the last "Synchronize Music Services" run persisted;
 * with none synced yet the shelf offers that sync instead.
 */
export const ServicesRow: React.FC<ServicesRowProps> = ({
  services,
  isLoading,
  isSyncing,
  syncError,
  onSelectService,
  onSynchronize,
  focusServiceId,
  onFocusShelf,
  isFirst = false,
  testID,
}) => {
  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <ActivityIndicator
        size="small"
        color={colors.primary}
        style={styles.loading}
      />
    );
  } else if (services.length === 0) {
    body = (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptySubtitle}>
          Import the music services already linked in your Sonos app.
        </Text>
        <TVFocusableButton
          label={isSyncing ? 'Synchronizing…' : 'Synchronize Music Services'}
          onPress={onSynchronize}
          onFocus={onFocusShelf}
          disabled={isSyncing}
          style={styles.syncButton}
          testID="synchronize-services-button"
        />
      </View>
    );
  } else {
    // autoFocus: entering the shelf from above lands on the first (or last
    // focused) tile, not on whichever tile sits geometrically closest.
    body = (
      <TVFocusGuideView autoFocus>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {services.map(({ service }) => (
            <TVServiceTile
              key={service.serviceId}
              name={service.name}
              onPress={() =>
                onSelectService({
                  service,
                  isAnonymous: service.auth.toLowerCase() === 'anonymous',
                })
              }
              onFocus={onFocusShelf}
              hasTVPreferredFocus={focusServiceId === service.serviceId}
              testID={`service-tile-${service.serviceId}`}
            />
          ))}
          {/* Trails the tiles (not beside the title) so D-pad down from the
            shelf above lands on a service, not on this secondary action. */}
          <TVFocusableButton
            label={isSyncing ? 'Syncing…' : 'Synchronize'}
            onPress={onSynchronize}
            onFocus={onFocusShelf}
            disabled={isSyncing}
            style={styles.resyncButton}
            textStyle={styles.resyncButtonText}
            testID="resynchronize-services-button"
          />
        </ScrollView>
      </TVFocusGuideView>
    );
  }

  return (
    <View testID={testID}>
      <View style={[styles.header, isFirst && styles.headerFirst]}>
        <Text style={styles.title}>Your Services</Text>
      </View>
      {syncError && <Text style={styles.errorText}>{syncError}</Text>}
      {body}
    </View>
  );
};

const styles = StyleSheet.create({
  // Header/row insets mirror HomeScreen's `sectionHeaderSubsequent` and
  // `swimlaneContainer` so this shelf lines up with the ones around it.
  header: {
    marginTop: spacing.sectionGap,
    paddingHorizontal: 36,
  },
  headerFirst: {
    marginTop: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  resyncButton: {
    alignSelf: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  resyncButtonText: {
    fontSize: 13,
  },
  row: {
    paddingLeft: 36,
    paddingRight: 64,
    // Room for TVFocusableCard's 1.04 focus scale.
    paddingTop: spacing.headerBottom + 4,
    // Matches HomeScreen's `swimlaneContainer` so the gap to the next shelf is the same.
    paddingBottom: 12,
    gap: spacing.md,
  },
  loading: {
    alignSelf: 'flex-start',
    marginLeft: 36,
    marginTop: spacing.md,
  },
  emptyContainer: {
    alignItems: 'flex-start',
    paddingHorizontal: 36,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 13,
    color: colors.statusError,
    paddingHorizontal: 36,
    marginTop: spacing.xs,
  },
  syncButton: {
    minWidth: 240,
  },
});
