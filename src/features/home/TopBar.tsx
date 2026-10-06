import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, Image } from 'react-native';
import { colors } from '../../theme';
import { MarqueeText } from '../../components/common/MarqueeText';

export type TopBarTab = 'home' | 'search' | 'favorites' | 'settings' | 'system' | 'nowPlaying';

export interface TopBarProps {
  activeTab: TopBarTab;
  onSelectTab: (tab: TopBarTab) => void;
  miniPlayerTitle?: string;
  miniPlayerArtist?: string;
  miniPlayerArtworkUri?: string;
  isPlaying?: boolean;
  deviceName?: string;
  /** Current speaker volume (0–100), shown on the right of the device button. */
  deviceVolume?: number;
  onPressDevice?: () => void;
}

const TABS: { id: TopBarTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'search', label: 'Search' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'settings', label: 'Settings' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  miniPlayerTitle,
  miniPlayerArtist,
  miniPlayerArtworkUri,
  isPlaying = false,
  deviceName,
  deviceVolume,
  onPressDevice,
}) => {
  const [focusedTab, setFocusedTab] = useState<TopBarTab | null>(null);
  const [isMiniPlayerFocused, setIsMiniPlayerFocused] = useState(false);
  const [isDeviceButtonFocused, setIsDeviceButtonFocused] = useState(false);

  const isMiniPlayerActive = activeTab === 'nowPlaying';
  const isDeviceActive = activeTab === 'system';

  return (
    <View style={styles.container}>
      {/* Left Section: Compact Spotify TV Style Mini Player Card */}
      <View style={styles.leftSection}>
        <Pressable
          accessibilityRole="button"
          testID="topbar-mini-player"
          hasTVPreferredFocus={isMiniPlayerActive}
          onFocus={() => setIsMiniPlayerFocused(true)}
          onBlur={() => setIsMiniPlayerFocused(false)}
          onPress={() => onSelectTab('nowPlaying')}
          style={[
            styles.miniPlayerContainer,
            isMiniPlayerActive && styles.miniPlayerActive,
            isMiniPlayerFocused && styles.miniPlayerFocused,
          ]}
        >
          <View style={styles.miniPlayerArtwork}>
            {miniPlayerArtworkUri ? (
              <Image
                source={{ uri: miniPlayerArtworkUri }}
                style={styles.miniPlayerArtworkImage}
                resizeMode="cover"
              />
            ) : isPlaying ? (
              <Text style={styles.miniPlayerIcon}>ılı</Text>
            ) : (
              <Text style={styles.miniPlayerIcon}>♪</Text>
            )}
          </View>
          <View style={styles.miniPlayerTextCol}>
            <MarqueeText
              text={miniPlayerTitle || 'Audio'}
              style={[
                styles.miniPlayerTitle,
                isMiniPlayerFocused && styles.miniPlayerTitleFocused,
              ]}
              isFocused={isMiniPlayerFocused}
            />
            <MarqueeText
              text={miniPlayerArtist || 'Standby'}
              style={[
                styles.miniPlayerArtist,
                isMiniPlayerFocused && styles.miniPlayerArtistFocused,
              ]}
              isFocused={isMiniPlayerFocused}
            />
          </View>
        </Pressable>
      </View>

      {/* Center Section: Minimalist Clean Text Tabs (No Icons) */}
      <View style={styles.centerSection}>
        <View style={styles.tabsRow}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const isFocused = focusedTab === tab.id;

            return (
              <Pressable
                key={tab.id}
                testID={`topbar-tab-${tab.id}`}
                hasTVPreferredFocus={isActive}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onFocus={() => setFocusedTab(tab.id)}
                onBlur={() => setFocusedTab(null)}
                onPress={() => onSelectTab(tab.id)}
                style={[
                  styles.tabItem,
                  isActive && styles.activeTabItem,
                  isFocused && styles.focusedTabItem,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive && styles.activeTabText,
                    isFocused && styles.focusedTabText,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Right Section: System / Connected Device Button */}
      <View style={styles.rightSection}>
        <Pressable
          accessibilityRole="button"
          testID="topbar-device-button"
          hasTVPreferredFocus={isDeviceActive}
          onFocus={() => setIsDeviceButtonFocused(true)}
          onBlur={() => setIsDeviceButtonFocused(false)}
          onPress={() => (onPressDevice ? onPressDevice() : onSelectTab('system'))}
          style={[
            styles.deviceButton,
            isDeviceActive && styles.deviceButtonActive,
            isDeviceButtonFocused && styles.deviceButtonFocused,
          ]}
        >
          <View style={styles.systemBarsContainer}>
            <View
              style={[
                styles.systemBar,
                styles.barLow,
                isDeviceButtonFocused && styles.systemBarFocused,
              ]}
            />
            <View
              style={[
                styles.systemBar,
                styles.barHigh,
                isDeviceButtonFocused && styles.systemBarFocused,
              ]}
            />
            <View
              style={[
                styles.systemBar,
                styles.barMid,
                isDeviceButtonFocused && styles.systemBarFocused,
              ]}
            />
          </View>
          <MarqueeText
            text={deviceName || 'System'}
            containerStyle={styles.deviceButtonTextContainer}
            style={[
              styles.deviceButtonText,
              isDeviceActive && styles.deviceButtonTextActive,
              isDeviceButtonFocused && styles.deviceButtonTextFocused,
            ]}
            isFocused={isDeviceButtonFocused}
          />
          {deviceVolume !== undefined && (
            <Text
              style={[styles.deviceVolumeText, isDeviceButtonFocused && styles.deviceVolumeTextFocused]}
              accessibilityLabel={`Volume ${deviceVolume}`}
            >
              {deviceVolume}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 14,
    left: 32,
    right: 32,
    zIndex: 100,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  leftSection: {
    width: 150,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniPlayerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 176,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161618',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    paddingRight: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  miniPlayerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  miniPlayerFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  miniPlayerArtwork: {
    width: 44,
    height: 44,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    backgroundColor: '#222226',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniPlayerArtworkImage: {
    width: '100%',
    height: '100%',
  },
  miniPlayerIcon: {
    fontSize: 20,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  miniPlayerTextCol: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 10,
  },
  miniPlayerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.1,
  },
  miniPlayerTitleFocused: {
    color: '#08080A',
  },
  miniPlayerArtist: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  miniPlayerArtistFocused: {
    color: '#3A3A3C',
    fontWeight: '600',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#161618',
    borderRadius: 22,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  activeTabItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  focusedTabItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  focusedTabText: {
    color: '#08080A',
    fontWeight: '700',
  },
  rightSection: {
    width: 150,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  deviceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 150,
    height: 44,
    gap: 8,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 22,
    backgroundColor: '#161618',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  deviceButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  deviceButtonFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  systemBarsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 14,
    width: 16,
    justifyContent: 'center',
  },
  systemBar: {
    width: 2.5,
    backgroundColor: colors.textPrimary,
    borderRadius: 1.5,
  },
  systemBarFocused: {
    backgroundColor: '#08080A',
  },
  barLow: {
    height: 7,
  },
  barHigh: {
    height: 14,
  },
  barMid: {
    height: 10,
  },
  deviceButtonTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  deviceButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
    textAlign: 'left',
  },
  deviceButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  deviceButtonTextFocused: {
    color: '#08080A',
    fontWeight: '700',
  },
  deviceVolumeText: {
    // Pulls the number closer than the button's 8px row gap.
    marginLeft: -4,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
    textAlign: 'right',
  },
  deviceVolumeTextFocused: {
    color: '#08080A',
  },
});
