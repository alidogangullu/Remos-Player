/**
 * Lightweight tagged logger.
 *
 * All Sonos network paths log through this so failures are visible in
 * `npx react-native log-android` / `adb logcat -s ReactNativeJS` instead of
 * being swallowed by empty catch blocks.
 */
const enabled = __DEV__;

function format(tag: string, message: string): string {
  return `[${tag}] ${message}`;
}

export const log = {
  debug(tag: string, message: string, data?: unknown): void {
    if (!enabled) return;
    if (data === undefined) console.log(format(tag, message));
    else console.log(format(tag, message), data);
  },
  warn(tag: string, message: string, data?: unknown): void {
    if (data === undefined) console.warn(format(tag, message));
    else console.warn(format(tag, message), data);
  },
  error(tag: string, message: string, error?: unknown): void {
    console.error(format(tag, message), describeError(error));
  },
};

/** Turns axios/SOAP errors into something readable in logcat. */
function describeError(error: unknown): string {
  if (!error) return '';
  const anyErr = error as any;
  if (anyErr?.response) {
    const body = typeof anyErr.response.data === 'string'
      ? anyErr.response.data.slice(0, 800)
      : JSON.stringify(anyErr.response.data)?.slice(0, 800);
    return `HTTP ${anyErr.response.status} ${anyErr.config?.url || ''} :: ${body}`;
  }
  if (anyErr?.request) {
    return `No response from ${anyErr.config?.url || 'unknown'} (${anyErr.code || 'network error'})`;
  }
  return String(anyErr?.message || anyErr);
}
