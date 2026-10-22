import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
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

export interface SoundSettingsPaneProps {
  speaker?: SonosDevice | null;
  onToggleNightMode?: (enabled: boolean) => void;
  onToggleSpeechEnhancement?: (enabled: boolean) => void;
}

/** The speaker's sound settings — the "Sound" section of the settings rail. */
export const SoundSettingsPane: React.FC<SoundSettingsPaneProps> = ({
  speaker,
  onToggleNightMode,
  onToggleSpeechEnhancement,
}) => {
  const { t } = useTranslation();
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
        <Text style={styles.emptyTitle}>{t('settings.sound.speakerRequired.title')}</Text>
        <Text style={styles.emptySubtitle}>{t('settings.sound.speakerRequired.subtitle')}</Text>
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
    ? t(`settings.sound.tvAutoplay.modes.${tvAutoplayMode}.description`)
    : t('settings.sound.tvAutoplay.reading');

  const tvAutoplayCard = isSoundbar ? (
    <View style={styles.autoplayCard} testID="tv-autoplay-card">
      {/* Top row: title + description of the selected mode on the left, mode selector on the right */}
      <View style={styles.autoplayCardRow}>
        <View style={styles.autoplayTextContainer}>
          <Text style={styles.autoplayTitle}>{t('settings.sound.tvAutoplay.title')}</Text>
          <Text style={styles.autoplayDescription}>
            {tvAutoplayDescription}
          </Text>
        </View>
        <View style={styles.autoplayModeRow} testID="tv-autoplay-mode-selector">
          {TV_AUTOPLAY_MODES.map(mode => (
            <TVFilterChip
              key={mode}
              label={t(`settings.sound.tvAutoplay.modes.${mode}.label`)}
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
          {t('settings.sound.tvAutoplay.tip', { smart: t('settings.sound.tvAutoplay.modes.smart.label') })}
        </Text>
      </View>
    </View>
  ) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* TV Autoplay — top of settings for soundbar devices */}
      {tvAutoplayCard}

      {capabilities.bass || capabilities.treble || capabilities.loudness ? (
        <Text style={styles.sectionTitle}>{t('settings.sound.eq.title')}</Text>
      ) : null}

      {capabilities.bass ? (
        <TVEQSlider
          title={t('settings.sound.eq.bass.title')}
          description={t('settings.sound.eq.bass.description')}
          value={bass}
          onChange={handleChangeBass}
          testID="eq-bass"
        />
      ) : null}

      {capabilities.treble ? (
        <TVEQSlider
          title={t('settings.sound.eq.treble.title')}
          description={t('settings.sound.eq.treble.description')}
          value={treble}
          onChange={handleChangeTreble}
          testID="eq-treble"
        />
      ) : null}

      {capabilities.loudness ? (
        <SettingsToggle
          title={t('settings.sound.eq.loudness.title')}
          description={t('settings.sound.eq.loudness.description')}
          isEnabled={loudness}
          onToggle={handleToggleLoudness}
          onPress={handleToggleLoudness}
          testID="toggle-loudness"
        />
      ) : null}

      {capabilities.bass || capabilities.treble ? (
        <View style={styles.resetRow}>
          <TVFocusableButton
            label={t('settings.sound.eq.reset')}
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
          <Text style={styles.sectionTitle}>{t('settings.sound.tvEnhancements.title')}</Text>

          {capabilities.nightMode ? (
            <SettingsToggle
              title={t('settings.sound.tvEnhancements.nightMode.title')}
              description={t('settings.sound.tvEnhancements.nightMode.description')}
              isEnabled={nightMode}
              onToggle={handleToggleNight}
              onPress={handleToggleNight}
              testID="toggle-night-mode"
            />
          ) : null}

          {capabilities.speechEnhancement ? (
            <SettingsToggle
              title={t('settings.sound.tvEnhancements.speech.title')}
              description={t('settings.sound.tvEnhancements.speech.description')}
              isEnabled={speechEnhancement}
              onToggle={handleToggleSpeech}
              onPress={handleToggleSpeech}
              testID="toggle-speech-enhancement"
            />
          ) : null}

          {isSoundbar ? (
            <SettingsToggle
              title={t('settings.sound.tvEnhancements.ungroup.title')}
              description={t('settings.sound.tvEnhancements.ungroup.description')}
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
          <Text style={styles.sectionTitle}>{t('settings.sound.sub.title')}</Text>

          <SettingsToggle
            title={t('settings.sound.sub.enable.title')}
            description={t('settings.sound.sub.enable.description')}
            isEnabled={subEnabled}
            onToggle={handleToggleSub}
            onPress={handleToggleSub}
            testID="toggle-sub-enable"
          />

          <TVEQSlider
            title={t('settings.sound.sub.level.title')}
            description={t('settings.sound.sub.level.description')}
            value={subGain}
            min={-10}
            max={10}
            onChange={handleChangeSubGain}
            testID="slider-sub-gain"
          />

          <TVEQSlider
            title={t('settings.sound.sub.crossover.title')}
            description={t('settings.sound.sub.crossover.description')}
            value={subCrossover}
            min={50}
            max={110}
            step={10}
            valueFormatter={val => `${val} Hz`}
            onChange={handleChangeSubCrossover}
            testID="slider-sub-crossover"
          />

          <SettingsToggle
            title={t('settings.sound.sub.phase.title')}
            description={t('settings.sound.sub.phase.description')}
            isEnabled={subPolarity === 180}
            actionLabel={`${subPolarity}°`}
            onToggle={handleToggleSubPolarity}
            onPress={handleToggleSubPolarity}
            testID="toggle-sub-phase"
          />

          <View style={styles.resetRow}>
            <TVFocusableButton
              label={t('settings.sound.sub.reset')}
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
          <Text style={styles.sectionTitle}>{t('settings.sound.surround.title')}</Text>

          <SettingsToggle
            title={t('settings.sound.surround.enable.title')}
            description={t('settings.sound.surround.enable.description')}
            isEnabled={surroundEnabled}
            onToggle={handleToggleSurround}
            onPress={handleToggleSurround}
            testID="toggle-surround-enable"
          />

          <TVEQSlider
            title={t('settings.sound.surround.tvLevel.title')}
            description={t('settings.sound.surround.tvLevel.description')}
            value={surroundLevel}
            min={-15}
            max={15}
            onChange={handleChangeSurroundLevel}
            testID="slider-surround-level"
          />

          <TVEQSlider
            title={t('settings.sound.surround.musicLevel.title')}
            description={t('settings.sound.surround.musicLevel.description')}
            value={surroundMusicLevel}
            min={-15}
            max={15}
            onChange={handleChangeSurroundMusicLevel}
            testID="slider-surround-music-level"
          />

          <SettingsToggle
            title={t('settings.sound.surround.musicPlayback.title')}
            description={t('settings.sound.surround.musicPlayback.description')}
            isEnabled={surroundMode === 'Full'}
            actionLabel={
              surroundMode === 'Full'
                ? t('settings.sound.surround.musicPlayback.full')
                : t('settings.sound.surround.musicPlayback.ambient')
            }
            onToggle={handleToggleSurroundMode}
            onPress={handleToggleSurroundMode}
            testID="toggle-surround-mode"
          />
        </>
      ) : null}

      {/* Height Audio Controls - only on Dolby Atmos supported hardware (Arc, Arc Ultra, Beam Gen 2, Era 300) */}
      {hasHeightAudio ? (
        <>
          <Text style={styles.sectionTitle}>{t('settings.sound.height.title')}</Text>

          <TVEQSlider
            title={t('settings.sound.height.level.title')}
            description={t('settings.sound.height.level.description')}
            value={heightLevel}
            min={-10}
            max={10}
            onChange={handleChangeHeightLevel}
            testID="slider-height-level"
          />

          <View style={styles.resetRow}>
            <TVFocusableButton
              label={t('settings.sound.height.reset')}
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
    paddingLeft: 36,
    paddingRight: 36,
  },
  contentContainer: {
    paddingTop: 76,
    paddingBottom: spacing.xxl,
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
