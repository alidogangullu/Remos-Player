import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme';
import { SettingsToggle } from './SettingsToggle';
import {
  TVEQSlider,
  TVFilterChip,
  TVFocusableButton,
} from '../../components/tv';
import { SonosDevice } from '../../types/sonos';
import { SonosUpnpClient } from '../../services/sonos/upnp/sonosUpnpClient';
import {
  SmartTvAutoplay,
  TvAutoplayMode,
  hasTvInput,
} from '../../services/sonos/autoplay/smartTvAutoplay';

const TV_AUTOPLAY_MODES: TvAutoplayMode[] = ['off', 'on', 'smart'];

const TV_AUTOPLAY_MODE_CONFIG: Record<
  TvAutoplayMode,
  { label: string; description: string }
> = {
  off: {
    label: 'OFF',
    description:
      'Sonos stays on the current music. TV audio only plays when you select it yourself.',
  },
  on: {
    label: 'ON',
    description:
      'Sonos automatically switches to TV audio when any audio signal is detected on the TV input — including Android TV interface sounds.',
  },
  smart: {
    label: 'SMART',
    description:
      "Turns off when you open this app and back on when you leave it, so interface sounds can't interrupt your music.",
  },
};

const TV_AUTOPLAY_UNKNOWN_DESCRIPTION =
  'Reading the current setting from the speaker…';

/**
 * Settings the speaker actually has. Each one is detected by reading it: the
 * speaker answers a setting it supports and returns a UPnP fault for one it
 * doesn't, so there is no model list to maintain.
 */
interface SpeakerCapabilities {
  bass: boolean;
  treble: boolean;
  loudness: boolean;
  nightMode: boolean;
  speechEnhancement: boolean;
  heightAudio: boolean;
  /** Sub settings exist on every home theater player, bonded Sub or not. */
  sub: boolean;
  /** Same for surrounds: the setting alone doesn't mean surrounds are bonded. */
  surround: boolean;
}

const NO_CAPABILITIES: SpeakerCapabilities = {
  bass: false,
  treble: false,
  loudness: false,
  nightMode: false,
  speechEnhancement: false,
  heightAudio: false,
  sub: false,
  surround: false,
};

export interface SettingsScreenProps {
  speaker?: SonosDevice | null;
  onToggleNightMode?: (enabled: boolean) => void;
  onToggleSpeechEnhancement?: (enabled: boolean) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  speaker,
  onToggleNightMode,
  onToggleSpeechEnhancement,
}) => {
  const [bass, setBass] = useState(0);
  const [treble, setTreble] = useState(0);
  const [loudness, setLoudness] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [speechEnhancement, setSpeechEnhancement] = useState(false);
  // null until the speaker's real setting has been read — never guess it.
  const [tvAutoplayMode, setTvAutoplayMode] = useState<TvAutoplayMode | null>(
    null,
  );
  const [isApplyingTvAutoplay, setIsApplyingTvAutoplay] = useState(false);
  const [tvAutoplayUngroup, setTvAutoplayUngroup] = useState(true);

  // Dynamic bonded hardware settings
  const [subEnabled, setSubEnabled] = useState(true);
  const [subGain, setSubGain] = useState(0);
  const [subCrossover, setSubCrossover] = useState(80);
  const [subPolarity, setSubPolarity] = useState<0 | 180>(0);
  const [surroundEnabled, setSurroundEnabled] = useState(true);
  const [surroundLevel, setSurroundLevel] = useState(0);
  const [surroundMusicLevel, setSurroundMusicLevel] = useState(0);
  const [surroundMode, setSurroundMode] = useState<'Ambient' | 'Full'>('Full');
  const [heightLevel, setHeightLevel] = useState(0);
  const [capabilities, setCapabilities] =
    useState<SpeakerCapabilities>(NO_CAPABILITIES);

  // TV input comes from the device description; everything else is probed below.
  const isSoundbar = hasTvInput(speaker);
  // Bonded hardware comes from the room topology — the speaker answers sub and
  // surround settings even when nothing is bonded to it.
  const hasSub = Boolean(speaker?.hasSub) && capabilities.sub;
  const hasSurrounds = Boolean(speaker?.hasSurrounds) && capabilities.surround;
  const hasHeightAudio = capabilities.heightAudio;

  // ON/OFF come from the speaker itself; SMART is an app-side choice layered on top.
  useEffect(() => {
    if (!speaker?.ip || !speaker?.id || !isSoundbar) return;
    let isMounted = true;
    SmartTvAutoplay.getMode({ id: speaker.id, ip: speaker.ip })
      .then(mode => {
        if (isMounted) setTvAutoplayMode(mode);
      })
      .catch(() => {
        if (isMounted) setTvAutoplayMode(null);
      });
    return () => {
      isMounted = false;
    };
  }, [speaker?.ip, speaker?.id, isSoundbar]);

  // Reads every setting at once; a setting that reads back is one the speaker has.
  useEffect(() => {
    let isMounted = true;
    setCapabilities(NO_CAPABILITIES);
    if (!speaker?.ip) return;
    const ip = speaker.ip;

    const read = async () => {
      const probes = {
        bass: SonosUpnpClient.getBass(ip),
        treble: SonosUpnpClient.getTreble(ip),
        loudness: SonosUpnpClient.getLoudness(ip),
        nightMode: SonosUpnpClient.getNightMode(ip),
        speechEnhancement: SonosUpnpClient.getSpeechEnhancement(ip),
        heightLevel: SonosUpnpClient.getHeightLevel(ip),
        subEnabled: SonosUpnpClient.getSubEnabled(ip),
        subGain: SonosUpnpClient.getSubGain(ip),
        subCrossover: SonosUpnpClient.getSubCrossover(ip),
        subPolarity: SonosUpnpClient.getSubPolarity(ip),
        surroundEnabled: SonosUpnpClient.getSurroundEnabled(ip),
        surroundLevel: SonosUpnpClient.getSurroundLevel(ip),
        surroundMusicLevel: SonosUpnpClient.getSurroundMusicLevel(ip),
        surroundMode: SonosUpnpClient.getSurroundMode(ip),
        // Autoplay settings answer on any player, so they're only read for TV inputs.
        tvAutoplayUngroup: isSoundbar
          ? SonosUpnpClient.getTVAutoplayUngroup(ip)
          : Promise.reject(new Error('No TV input')),
      };
      const keys = Object.keys(probes) as (keyof typeof probes)[];
      const settled = await Promise.allSettled(keys.map(key => probes[key]));
      if (!isMounted) return;

      const values: Partial<{
        [K in keyof typeof probes]: Awaited<(typeof probes)[K]>;
      }> = {};
      keys.forEach((key, i) => {
        const result = settled[i];
        if (result.status === 'fulfilled')
          (values as Record<string, unknown>)[key] = result.value;
      });

      if (values.bass !== undefined) setBass(values.bass);
      if (values.treble !== undefined) setTreble(values.treble);
      if (values.loudness !== undefined) setLoudness(values.loudness);
      if (values.nightMode !== undefined) setNightMode(values.nightMode);
      if (values.speechEnhancement !== undefined)
        setSpeechEnhancement(values.speechEnhancement);
      if (values.heightLevel !== undefined) setHeightLevel(values.heightLevel);
      if (values.subEnabled !== undefined) setSubEnabled(values.subEnabled);
      if (values.subGain !== undefined) setSubGain(values.subGain);
      if (values.subCrossover !== undefined)
        setSubCrossover(values.subCrossover);
      if (values.subPolarity !== undefined)
        setSubPolarity(values.subPolarity as 0 | 180);
      if (values.surroundEnabled !== undefined)
        setSurroundEnabled(values.surroundEnabled);
      if (values.surroundLevel !== undefined)
        setSurroundLevel(values.surroundLevel);
      if (values.surroundMusicLevel !== undefined)
        setSurroundMusicLevel(values.surroundMusicLevel);
      if (values.surroundMode !== undefined)
        setSurroundMode(values.surroundMode);
      if (values.tvAutoplayUngroup !== undefined)
        setTvAutoplayUngroup(values.tvAutoplayUngroup);

      setCapabilities({
        bass: values.bass !== undefined,
        treble: values.treble !== undefined,
        loudness: values.loudness !== undefined,
        nightMode: values.nightMode !== undefined,
        speechEnhancement: values.speechEnhancement !== undefined,
        heightAudio: values.heightLevel !== undefined,
        sub: values.subEnabled !== undefined,
        surround: values.surroundEnabled !== undefined,
      });
    };

    read();
    return () => {
      isMounted = false;
    };
  }, [speaker?.ip, isSoundbar]);

  if (!speaker) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Speaker Required</Text>
        <Text style={styles.emptySubtitle}>
          Connect to a Sonos speaker to configure audio and sound settings.
        </Text>
      </View>
    );
  }

  const handleChangeBass = async (newBass: number) => {
    setBass(newBass);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setBass(speaker.ip, newBass);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleChangeTreble = async (newTreble: number) => {
    setTreble(newTreble);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setTreble(speaker.ip, newTreble);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleLoudness = async () => {
    const nextVal = !loudness;
    setLoudness(nextVal);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setLoudness(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleResetEQ = async () => {
    setBass(0);
    setTreble(0);
    setLoudness(true);

    try {
      if (speaker.ip) {
        await Promise.allSettled([
          SonosUpnpClient.setBass(speaker.ip, 0),
          SonosUpnpClient.setTreble(speaker.ip, 0),
          SonosUpnpClient.setLoudness(speaker.ip, true),
        ]);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleNight = async () => {
    const nextVal = !nightMode;
    setNightMode(nextVal);
    onToggleNightMode?.(nextVal);

    try {
      if (speaker.ip) {
        await SonosUpnpClient.setNightMode(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleSpeech = async () => {
    const nextVal = !speechEnhancement;
    setSpeechEnhancement(nextVal);
    onToggleSpeechEnhancement?.(nextVal);

    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSpeechEnhancement(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleSelectTVAutoplayMode = async (mode: TvAutoplayMode) => {
    if (
      mode === tvAutoplayMode ||
      isApplyingTvAutoplay ||
      !speaker?.ip ||
      !speaker?.id
    )
      return;
    const prev = tvAutoplayMode;
    setTvAutoplayMode(mode);
    setIsApplyingTvAutoplay(true);
    try {
      setTvAutoplayMode(
        await SmartTvAutoplay.applyMode(
          { id: speaker.id, ip: speaker.ip },
          mode,
        ),
      );
    } catch {
      setTvAutoplayMode(prev);
    } finally {
      setIsApplyingTvAutoplay(false);
    }
  };

  const handleToggleTVUngroup = async () => {
    const nextVal = !tvAutoplayUngroup;
    setTvAutoplayUngroup(nextVal);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setTVAutoplayUngroup(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleSub = async () => {
    const nextVal = !subEnabled;
    setSubEnabled(nextVal);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSubEnabled(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleChangeSubGain = async (newGain: number) => {
    setSubGain(newGain);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSubGain(speaker.ip, newGain);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleChangeSubCrossover = async (newCrossover: number) => {
    setSubCrossover(newCrossover);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSubCrossover(speaker.ip, newCrossover);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleSubPolarity = async () => {
    const nextVal: 0 | 180 = subPolarity === 0 ? 180 : 0;
    setSubPolarity(nextVal);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSubPolarity(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleResetSub = async () => {
    setSubGain(0);
    setSubCrossover(80);
    setSubPolarity(0);
    try {
      if (speaker.ip) {
        await Promise.allSettled([
          SonosUpnpClient.setSubGain(speaker.ip, 0),
          SonosUpnpClient.setSubCrossover(speaker.ip, 80),
          SonosUpnpClient.setSubPolarity(speaker.ip, 0),
        ]);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleSurround = async () => {
    const nextVal = !surroundEnabled;
    setSurroundEnabled(nextVal);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSurroundEnabled(speaker.ip, nextVal);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleChangeSurroundLevel = async (newLevel: number) => {
    setSurroundLevel(newLevel);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSurroundLevel(speaker.ip, newLevel);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleChangeSurroundMusicLevel = async (newLevel: number) => {
    setSurroundMusicLevel(newLevel);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSurroundMusicLevel(speaker.ip, newLevel);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleToggleSurroundMode = async () => {
    const nextMode = surroundMode === 'Ambient' ? 'Full' : 'Ambient';
    setSurroundMode(nextMode);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setSurroundMode(speaker.ip, nextMode);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleChangeHeightLevel = async (newLevel: number) => {
    setHeightLevel(newLevel);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setHeightLevel(speaker.ip, newLevel);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  const handleResetHeight = async () => {
    setHeightLevel(0);
    try {
      if (speaker.ip) {
        await SonosUpnpClient.setHeightLevel(speaker.ip, 0);
      }
    } catch {
      // Handled gracefully for offline or mock test states
    }
  };

  // Build TV Autoplay mode card (only for soundbars — devices with TV input)
  const tvAutoplayDescription = tvAutoplayMode
    ? TV_AUTOPLAY_MODE_CONFIG[tvAutoplayMode].description
    : TV_AUTOPLAY_UNKNOWN_DESCRIPTION;

  const tvAutoplayCard = isSoundbar ? (
    <View style={styles.autoplayCard} testID="tv-autoplay-card">
      {/* Top row: title + description of the selected mode on the left, mode selector on the right */}
      <View style={styles.autoplayCardRow}>
        <View style={styles.autoplayTextContainer}>
          <Text style={styles.autoplayTitle}>TV Autoplay</Text>
          <Text style={styles.autoplayDescription}>
            {tvAutoplayDescription}
          </Text>
        </View>
        <View style={styles.autoplayModeRow} testID="tv-autoplay-mode-selector">
          {TV_AUTOPLAY_MODES.map(mode => (
            <TVFilterChip
              key={mode}
              label={TV_AUTOPLAY_MODE_CONFIG[mode].label}
              active={tvAutoplayMode === mode}
              onPress={() => handleSelectTVAutoplayMode(mode)}
              testID={`tv-autoplay-mode-${mode}`}
            />
          ))}
        </View>
      </View>

      {/* Tip callout — inside the card, below the row */}
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>
          {
            'Tip: If TV navigation clicks keep stopping your music, choose SMART — TV Autoplay turns off when you open this app and back on when you leave it.'
          }
        </Text>
      </View>
    </View>
  ) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.headerRow}>
        <Text style={styles.header}>Sound &amp; Equalizer Settings</Text>
        <Text style={styles.headerSubtitle}>
          {`Configuring ${speaker.name} (${
            speaker.modelName || 'Sonos Speaker'
          })`}
        </Text>
      </View>

      {/* TV Autoplay — top of settings for soundbar devices */}
      {tvAutoplayCard}

      {capabilities.bass || capabilities.treble || capabilities.loudness ? (
        <Text style={styles.sectionTitle}>Equalizer (EQ)</Text>
      ) : null}

      {capabilities.bass ? (
        <TVEQSlider
          title="Bass"
          description="Adjust low-frequency balance from -10 to +10"
          value={bass}
          onChange={handleChangeBass}
          testID="eq-bass"
        />
      ) : null}

      {capabilities.treble ? (
        <TVEQSlider
          title="Treble"
          description="Adjust high-frequency balance from -10 to +10"
          value={treble}
          onChange={handleChangeTreble}
          testID="eq-treble"
        />
      ) : null}

      {capabilities.loudness ? (
        <SettingsToggle
          title="Loudness"
          description="Boosts certain frequencies at lower volumes to produce a fuller, balanced sound"
          isEnabled={loudness}
          onToggle={handleToggleLoudness}
          onPress={handleToggleLoudness}
          testID="toggle-loudness"
        />
      ) : null}

      {capabilities.bass || capabilities.treble ? (
        <View style={styles.resetRow}>
          <TVFocusableButton
            label="Reset Equalizer to Flat"
            onPress={handleResetEQ}
            testID="button-reset-eq"
            style={styles.resetButton}
          />
        </View>
      ) : null}

      {/* TV Audio Enhancements - each shown only if the speaker reads it back */}
      {capabilities.nightMode ||
      capabilities.speechEnhancement ||
      isSoundbar ? (
        <>
          <Text style={styles.sectionTitle}>TV Audio Enhancements</Text>

          {capabilities.nightMode ? (
            <SettingsToggle
              title="Night Mode"
              description="Compresses audio dynamic range for quiet late-night listening"
              isEnabled={nightMode}
              onToggle={handleToggleNight}
              onPress={handleToggleNight}
              testID="toggle-night-mode"
            />
          ) : null}

          {capabilities.speechEnhancement ? (
            <SettingsToggle
              title="Speech Enhancement"
              description="Boosts dialogue clarity and center voice channels for TV sound"
              isEnabled={speechEnhancement}
              onToggle={handleToggleSpeech}
              onPress={handleToggleSpeech}
              testID="toggle-speech-enhancement"
            />
          ) : null}

          {isSoundbar ? (
            <SettingsToggle
              title="Ungroup on Autoplay"
              description="Automatically drop this room from music groups when TV audio starts playing"
              isEnabled={tvAutoplayUngroup}
              onToggle={handleToggleTVUngroup}
              onPress={handleToggleTVUngroup}
              testID="toggle-tv-ungroup"
            />
          ) : null}
        </>
      ) : null}

      {/* Subwoofer Controls - only when Sub is bonded */}
      {hasSub ? (
        <>
          <Text style={styles.sectionTitle}>Sub Audio</Text>

          <SettingsToggle
            title="Sub"
            description="Enable or disable deep low-frequency output to the bonded Sonos Sub"
            isEnabled={subEnabled}
            onToggle={handleToggleSub}
            onPress={handleToggleSub}
            testID="toggle-sub-enable"
          />

          <TVEQSlider
            title="Sub Level"
            description="Adjust subwoofer output power and punch from -10 to +10"
            value={subGain}
            min={-10}
            max={10}
            onChange={handleChangeSubGain}
            testID="slider-sub-gain"
          />

          <TVEQSlider
            title="Crossover Frequency"
            description="Lower end is best for large floor speakers, higher end for compact speakers."
            value={subCrossover}
            min={50}
            max={110}
            step={10}
            valueFormatter={val => `${val} Hz`}
            onChange={handleChangeSubCrossover}
            testID="slider-sub-crossover"
          />

          <SettingsToggle
            title="Phase Control"
            description="Align subwoofer speaker cone timing with main speakers (0° or 180°)"
            isEnabled={subPolarity === 180}
            actionLabel={`${subPolarity}°`}
            onToggle={handleToggleSubPolarity}
            onPress={handleToggleSubPolarity}
            testID="toggle-sub-phase"
          />

          <View style={styles.resetRow}>
            <TVFocusableButton
              label="Reset Sub Audio"
              onPress={handleResetSub}
              testID="button-reset-sub"
              style={styles.resetButton}
            />
          </View>
        </>
      ) : null}

      {/* Surround Sound Controls - only when rear surround speakers are bonded */}
      {hasSurrounds ? (
        <>
          <Text style={styles.sectionTitle}>Surround Audio</Text>

          <SettingsToggle
            title="Surrounds"
            description="Enable or disable rear surround sound speakers in this room"
            isEnabled={surroundEnabled}
            onToggle={handleToggleSurround}
            onPress={handleToggleSurround}
            testID="toggle-surround-enable"
          />

          <TVEQSlider
            title="TV Level"
            description="Adjust relative volume balance of rear surround speakers for TV from -15 to +15"
            value={surroundLevel}
            min={-15}
            max={15}
            onChange={handleChangeSurroundLevel}
            testID="slider-surround-level"
          />

          <TVEQSlider
            title="Music Level"
            description="Adjust relative volume balance of rear surround speakers for music from -15 to +15"
            value={surroundMusicLevel}
            min={-15}
            max={15}
            onChange={handleChangeSurroundMusicLevel}
            testID="slider-surround-music-level"
          />

          <SettingsToggle
            title="Music Playback"
            description="Set whether surrounds play subtle ambient accompaniment or full stereo sound for music"
            isEnabled={surroundMode === 'Full'}
            actionLabel={surroundMode}
            onToggle={handleToggleSurroundMode}
            onPress={handleToggleSurroundMode}
            testID="toggle-surround-mode"
          />
        </>
      ) : null}

      {/* Height Audio Controls - only on Dolby Atmos supported hardware (Arc, Arc Ultra, Beam Gen 2, Era 300) */}
      {hasHeightAudio ? (
        <>
          <Text style={styles.sectionTitle}>Height Audio</Text>

          <TVEQSlider
            title="Height Level"
            description="Adjust the height channel audio level during playback of immersive audio formats."
            value={heightLevel}
            min={-10}
            max={10}
            onChange={handleChangeHeightLevel}
            testID="slider-height-level"
          />

          <View style={styles.resetRow}>
            <TVFocusableButton
              label="Reset"
              onPress={handleResetHeight}
              testID="button-reset-height"
              style={styles.resetButton}
            />
          </View>
        </>
      ) : null}
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  resetRow: {
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
    marginTop: -spacing.xs,
  },
  resetButton: {
    paddingHorizontal: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPaddingHorizontal,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 480,
    lineHeight: 22,
  },
  // ── TV Autoplay card ────────────────────────────────────────────────────
  autoplayCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.xl,
  },
  autoplayCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 72,
    marginBottom: spacing.md,
  },
  autoplayTextContainer: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  autoplayTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  autoplayDescription: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 20,
  },
  autoplayModeRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: spacing.sm,
  },
  tipBox: {
    backgroundColor: 'rgba(229, 169, 60, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: 8,
    padding: spacing.md,
  },
  tipText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 20,
  },
});
