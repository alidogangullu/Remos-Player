import en from './en';
import tr from './tr';
import de from './de';
import fr from './fr';
import es from './es';
import nl from './nl';

/** Bundled with the app: a TV app shouldn't wait on the network to show its own UI. */
export const resources = {
  en: { translation: en },
  tr: { translation: tr },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  nl: { translation: nl },
} as const;
