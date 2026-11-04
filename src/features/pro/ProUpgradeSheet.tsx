import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../../theme';
import { TVPillButton } from '../../components/tv';
import { usePro } from '../../services/billing/ProProvider';
import { ProBadge } from './ProBadge';
import { useProOfferText } from './useProOfferText';

/**
 * Opens over whatever screen a Pro action was pressed on, so the user can
 * buy in place or go straight back to looking around. Back or "Not now"
 * closes it and focus returns to the control that opened it.
 */
export const ProUpgradeSheet: React.FC = () => {
  const { t } = useTranslation();
  const { upgradeRequest, buyPro, dismissUpgrade } = usePro();
  const { unlockLabel, isPurchasing, statusText, isStatusError } = useProOfferText();
  const appear = useRef(new Animated.Value(0)).current;
  const isOpen = upgradeRequest !== null;

  useEffect(() => {
    if (!isOpen) return;
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isOpen, upgradeRequest?.id, appear]);

  if (!upgradeRequest) return null;
  const feature = upgradeRequest.feature;

  return (
    // A Modal is its own window: D-pad focus stays inside it, and closing it hands focus back.
    <Modal transparent visible animationType="none" onRequestClose={dismissUpgrade} statusBarTranslucent>
      <View style={styles.scrim}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: appear,
              transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
          testID={`pro-upgrade-sheet${feature ? `-${feature}` : ''}`}
        >
          <ProBadge label={t('pro.eyebrow')} />
          <Text style={styles.title}>{t(feature ? `pro.gate.${feature}.title` : 'pro.paneTitle')}</Text>
          <Text style={styles.body}>{t(feature ? `pro.gate.${feature}.body` : 'pro.paneSubtitle')}</Text>
          <Text style={styles.oneTime}>{t('pro.gate.oneTime')}</Text>

          <View style={styles.actions}>
            <TVPillButton
              variant="primary"
              label={unlockLabel}
              disabled={isPurchasing}
              onPress={buyPro}
              hasTVPreferredFocus
              testID="button-sheet-unlock-pro"
            />
            <TVPillButton label={t('pro.gate.notNow')} onPress={dismissUpgrade} testID="button-sheet-not-now" />
          </View>
          {statusText ? (
            <Text style={[styles.status, isStatusError && styles.statusError]} accessibilityLiveRegion="polite">
              {statusText}
            </Text>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayScrim,
    paddingHorizontal: spacing.screenPaddingHorizontal,
  },
  card: {
    width: 560,
    maxWidth: '100%',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginTop: spacing.xs,
  },
  body: {
    fontSize: 17,
    lineHeight: 25,
    color: colors.textSecondary,
  },
  oneTime: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  status: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statusError: {
    color: colors.statusError,
  },
});
