// Hermes has no Intl.PluralRules; without it i18next resolves only English-style plurals.
import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { findBestLanguageTag } from 'react-native-localize';
import { resources } from '../locales';
import {
  FALLBACK_LANGUAGE,
  LanguageCode,
  LanguagePreference,
  SUPPORTED_LANGUAGE_CODES,
  isLanguageCode,
} from './languages';

export const defaultNS = 'translation';

/** The supported language closest to the device's preferred-language list. */
export function detectDeviceLanguage(): LanguageCode {
  const tag = findBestLanguageTag(SUPPORTED_LANGUAGE_CODES)?.languageTag;
  return isLanguageCode(tag) ? tag : FALLBACK_LANGUAGE;
}

export function resolveLanguage(preference: LanguagePreference): LanguageCode {
  return preference === 'system' ? detectDeviceLanguage() : preference;
}

/** The language the UI is showing right now (always a supported code). */
export function currentLanguage(): LanguageCode {
  return isLanguageCode(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
}

// Resources are bundled, so init completes synchronously and the first frame
// is already translated. LanguageProvider then applies a saved preference.
i18n.use(initReactI18next).init({
  resources,
  defaultNS,
  lng: detectDeviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGE_CODES,
  // React already escapes text; escaping again would show "&quot;" in titles.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };
