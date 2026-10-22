import { defineConfig } from 'i18next-cli';

/**
 * Used for `yarn i18n:lint` only (flags hardcoded UI strings). Translations
 * live in src/locales/<lang>/<area>.json, merged into one `translation`
 * namespace by src/locales/<lang>/index.ts, so don't run `i18next-cli extract`
 * against this layout — it would write a single translation.json per language.
 */
export default defineConfig({
  locales: ['en', 'tr', 'de', 'fr', 'es', 'nl'],
  extract: {
    input: ['App.tsx', 'src/**/*.{ts,tsx}'],
    ignore: ['src/locales/**', 'node_modules/**'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'translation',
    functions: ['t', 'i18n.t'],
    primaryLanguage: 'en',
  },
  lint: {
    // React Native has no HTML tags: lint <Text> children and the props our
    // components render as visible or spoken text.
    acceptedTags: ['Text', 'MarqueeText'],
    acceptedAttributes: ['label', 'title', 'subtitle', 'description', 'text', 'placeholder', 'accessibilityLabel', 'actionLabel'],
  },
});
