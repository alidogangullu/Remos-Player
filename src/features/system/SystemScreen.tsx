import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { TVFocusableCard, TVPillButton } from '../../components/tv';
import { SonosDevice } from '../../types/sonos';
import { SonosDiscoveryService } from '../../services/sonos/discovery/sonosDiscoveryService';
import { describeRoomHardware } from '../../services/sonos/roomDisplay';

export interface SystemScreenProps {
  speaker: SonosDevice | null;
  speakers?: SonosDevice[];
  onSelectSpeaker?: (speaker: SonosDevice) => void;
  onRescanNetwork?: () => Promise<void> | void;
}

export const SystemScreen: React.FC<SystemScreenProps> = ({
  speaker,
  speakers,
  onSelectSpeaker,
  onRescanNetwork,
}) => {
  const { t } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'complete' | 'timeout' | null>(null);

  // If speakers list provided, use it; otherwise fallback to single speaker or empty array
  const speakerList: SonosDevice[] =
    speakers && speakers.length > 0
      ? speakers
      : speaker
      ? [speaker]
      : [];

  const isConnected = speakerList.length > 0;

  const handleRescan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanStatus('scanning');

    try {
      if (onRescanNetwork) {
        await onRescanNetwork();
      } else if (speaker?.ip) {
        await SonosDiscoveryService.probeSpeaker(speaker.ip);
      }
      setScanStatus('complete');
    } catch {
      setScanStatus('timeout');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('system.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('system.subtitle')}</Text>
      </View>

      {isConnected ? (
        <View style={styles.speakersList}>
          {speakerList.map((item, index) => {
            const isActive = speaker?.id ? item.id === speaker.id : index === 0;

            return (
              <TVFocusableCard
                key={item.id || item.ip || index}
                onPress={() => onSelectSpeaker?.(item)}
                style={[
                  styles.card,
                  isActive && styles.activeCard,
                ]}
                testID={isActive ? 'speaker-details-card' : `speaker-card-${item.id || index}`}
              >
                <View style={styles.cardContent}>
                  {/* Center: Device Name and Model */}
                  <View style={styles.cardInfo}>
                    {/* A room is what users pick; its main player's model is secondary. */}
                    <Text style={styles.cardDeviceName} numberOfLines={1}>
                      {item.name || item.modelName || t('common.room')}
                    </Text>
                    <View style={styles.cardMetaRow}>
                      <Text style={styles.cardModelText} numberOfLines={1}>
                        {describeRoomHardware(item)}
                      </Text>
                      {item.groupMembersCount && item.groupMembersCount > 1 ? (
                        <>
                          <Text style={styles.metaDivider}>•</Text>
                          <Text style={styles.coordinatorBadge} testID="grouped-speakers-badge">
                            {item.groupedWith && item.groupedWith.length === 1
                              ? t('system.groupedWithOne', { name: item.groupedWith[0] })
                              : item.groupedWith && item.groupedWith.length === 2
                              ? t('system.groupedWithTwo', { first: item.groupedWith[0], second: item.groupedWith[1] })
                              : t('system.groupedMore', { count: item.groupMembersCount - 1 })}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>

                  {/* Right: Active status pill or selection hint */}
                  {isActive ? (
                    <View style={styles.activeBadge} testID="speaker-active-badge">
                      <View style={styles.activeDot} />
                      <Text style={styles.activeBadgeText}>{t('system.active')}</Text>
                    </View>
                  ) : (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>{t('system.select')}</Text>
                    </View>
                  )}
                </View>
              </TVFocusableCard>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyNoticeContainer} testID="no-speakers-notice">
          <Text style={styles.emptyNoticeTitle}>{t('system.emptyTitle')}</Text>
          <Text style={styles.emptyNoticeText}>{t('system.emptySubtitle')}</Text>
        </View>
      )}

      <View style={styles.networkSection}>
        <Text style={styles.sectionTitle}>{t('system.diagnostics')}</Text>
        {scanStatus && <Text style={styles.scanStatus}>{t(`system.scanStatus.${scanStatus}`)}</Text>}
        <TVPillButton
          label={isScanning ? t('system.scanningButton') : t('system.rescanButton')}
          onPress={handleRescan}
          disabled={isScanning}
          testID="network-rescan-button"
          style={styles.rescanButton}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 36,
  },
  contentContainer: {
    paddingTop: 76,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    marginBottom: spacing.md,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },
  speakersList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  card: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    minHeight: 76,
    justifyContent: 'center',
  },
  activeCard: {
    borderColor: 'rgba(229, 169, 60, 0.45)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  cardDeviceName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardModelText: {
    fontSize: 14,
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },
  metaDivider: {
    fontSize: 14,
    color: colors.textMuted,
    marginHorizontal: 8,
  },
  coordinatorBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(229, 169, 60, 0.14)',
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  inactiveBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  inactiveBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  emptyNoticeContainer: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyNoticeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptyNoticeText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    maxWidth: 600,
  },
  networkSection: {
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: 0.2,
  },
  scanStatus: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  rescanButton: {
    alignSelf: 'flex-start',
  },
});
