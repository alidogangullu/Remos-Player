import packageJson from '../../package.json';

export const APP_INFO = {
  NAME: 'Remos Player',
  /** Also drives Android versionName (see android/app/build.gradle). */
  VERSION: packageJson.version,
  ANDROID_PACKAGE: 'com.adg.remos',
  WEBSITE: 'adgn.me/en/projects#remos-tv',
  PRIVACY_URL: 'adgn.me/remos-for-sonos/privacy',
  SUPPORT_EMAIL: 'support@adgn.me',
};

/**
 * Remote config (version gate + notifications) lives in a GitHub Gist so it can
 * be edited without shipping a build. The `/raw/<file>` URL always serves the
 * latest revision. Template: docs/remote-config.json.
 */
export const REMOTE_CONFIG_URL =
  'https://gist.githubusercontent.com/alidogangullu/5a995be2cfed95b168e340f6f4f05f0c/raw/remos-config.json';

export const DEFAULT_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_INFO.ANDROID_PACKAGE}`;
