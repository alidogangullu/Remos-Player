// Importing this module initializes i18next (see setup.ts).
export { i18n, defaultNS, detectDeviceLanguage, resolveLanguage, currentLanguage } from './setup';
export * from './languages';
export { LanguageProvider, useLanguage } from './LanguageProvider';
export { formatDate, formatTime, toDisplayUpperCase } from './format';
