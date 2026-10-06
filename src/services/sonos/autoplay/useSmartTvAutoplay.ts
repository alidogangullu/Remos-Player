import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SonosDevice } from '../../../types/sonos';
import { SmartTvAutoplay } from './smartTvAutoplay';

/**
 * Drives smart TV Autoplay from the app lifecycle: suspended on every smart
 * soundbar while the app is in the foreground, restored when it leaves.
 * Soundbars not in smart mode are never touched.
 */
export function useSmartTvAutoplay(speaker: SonosDevice | null): void {
  // Works from stored addresses, so launch doesn't wait for speaker discovery.
  // Going to the background also repairs a previous session killed mid-suspend.
  useEffect(() => {
    if (AppState.currentState === 'active') SmartTvAutoplay.onForeground();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') SmartTvAutoplay.onForeground();
      else SmartTvAutoplay.onBackground();
    });
    return () => subscription.remove();
  }, []);

  // Discovery may find a smart soundbar at a new address; suspend it there.
  const id = speaker?.id;
  const ip = speaker?.ip;
  useEffect(() => {
    if (!id || !ip) return;
    SmartTvAutoplay.updateAddress({ id, ip }).then((changed) => {
      if (changed && AppState.currentState === 'active') SmartTvAutoplay.onForeground();
    });
  }, [id, ip]);
}
