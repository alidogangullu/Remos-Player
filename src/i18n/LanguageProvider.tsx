import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import i18n from 'i18next';
import { LanguageStore } from './languageStore';
import { LanguageCode, LanguagePreference, isLanguageCode, FALLBACK_LANGUAGE } from './languages';
import { detectDeviceLanguage, resolveLanguage } from './setup';

interface LanguageContextValue {
  /** What the user picked: 'system' follows the device language. */
  preference: LanguagePreference;
  /** The language actually on screen. */
  language: LanguageCode;
  setPreference: (preference: LanguagePreference) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Applies the saved language choice before the app renders, so a user who
 * picked a language other than the device's never sees a frame in the wrong
 * one. Bundled resources make the switch instant, without a restart.
 */
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<LanguagePreference | null>(null);
  const [language, setLanguage] = useState<LanguageCode>(
    isLanguageCode(i18n.language) ? i18n.language : FALLBACK_LANGUAGE,
  );

  const apply = useCallback((next: LanguagePreference) => {
    const resolved = resolveLanguage(next);
    if (i18n.language !== resolved) i18n.changeLanguage(resolved);
    setLanguage(resolved);
  }, []);

  useEffect(() => {
    let isMounted = true;
    LanguageStore.getPreference().then((stored) => {
      if (!isMounted) return;
      apply(stored);
      setPreferenceState(stored);
    });
    return () => {
      isMounted = false;
    };
  }, [apply]);

  // "System default" follows a device language change made while the app was in the background.
  useEffect(() => {
    if (preference !== 'system') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && i18n.language !== detectDeviceLanguage()) apply('system');
    });
    return () => subscription.remove();
  }, [preference, apply]);

  const setPreference = useCallback(
    (next: LanguagePreference) => {
      apply(next);
      setPreferenceState(next);
      LanguageStore.setPreference(next);
    },
    [apply],
  );

  const value = useMemo<LanguageContextValue | null>(
    () => (preference ? { preference, language, setPreference } : null),
    [preference, language, setPreference],
  );

  // AsyncStorage answers within a few ms; render nothing rather than a wrong-language frame.
  if (!value) return null;
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return value;
}
