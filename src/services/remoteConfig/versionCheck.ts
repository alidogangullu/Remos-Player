import { Linking } from 'react-native';
import { APP_INFO } from '../../constants/appInfo';
import { log } from '../../utils/logger';
import { RemoteConfig } from './remoteConfigService';

export type UpdateStatus = 'up_to_date' | 'optional_update' | 'force_update';

export interface UpdateInfo {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  storeUrl: string;
  releaseNotes: string[];
}

/** Numeric dotted-version compare: 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function getUpdateInfo(
  config: RemoteConfig,
  currentVersion: string = APP_INFO.VERSION,
): UpdateInfo {
  let status: UpdateStatus = 'up_to_date';
  if (compareVersions(currentVersion, config.minVersion) < 0) status = 'force_update';
  else if (compareVersions(currentVersion, config.latestVersion) < 0) status = 'optional_update';

  return {
    status,
    currentVersion,
    latestVersion: config.latestVersion,
    storeUrl: config.storeUrl,
    releaseNotes: config.releaseNotes,
  };
}

/** Opens the Play Store listing, falling back to the market:// intent. */
export async function openStoreListing(storeUrl: string): Promise<void> {
  try {
    await Linking.openURL(storeUrl);
  } catch (error) {
    log.warn('Update', `Could not open ${storeUrl}, trying market://`, error);
    try {
      await Linking.openURL(`market://details?id=${APP_INFO.ANDROID_PACKAGE}`);
    } catch (fallbackError) {
      log.error('Update', 'Could not open the store', fallbackError);
    }
  }
}
