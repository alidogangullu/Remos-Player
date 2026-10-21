import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';

/**
 * Consumes the remote's Back press while `enabled`, running `handler` instead
 * of Android's default (which finishes the activity and closes the app).
 *
 * BackHandler calls the most recently registered listener first, so a
 * listener only stays on top if it registers after everyone below it. Gate
 * nested views on `enabled` (register only while the view is open) so the
 * innermost open view always handles Back first; the app-level fallback in
 * App.tsx registers once on mount and stays at the bottom.
 */
export function useBackHandler(enabled: boolean, handler: () => void): void {
  // Always calls the latest handler without re-registering (which would
  // change the listener's place in the stack).
  const onBack = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [enabled]);
}
