import 'i18next';
import type { TranslationResources } from '../locales/en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    // English is the source of truth: t('…') autocompletes its keys and rejects unknown ones.
    resources: { translation: TranslationResources };
  }
}
