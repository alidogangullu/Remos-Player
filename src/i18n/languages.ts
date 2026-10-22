export const SUPPORTED_LANGUAGES = [
  { code: 'en', nativeName: 'English' },
  { code: 'tr', nativeName: 'Türkçe' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'es', nativeName: 'Español' },
  { code: 'nl', nativeName: 'Nederlands' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

/** What the user picked in Settings › Language: follow the device, or a fixed language. */
export type LanguagePreference = 'system' | LanguageCode;

export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export const SUPPORTED_LANGUAGE_CODES: LanguageCode[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (SUPPORTED_LANGUAGE_CODES as string[]).includes(value);
}
