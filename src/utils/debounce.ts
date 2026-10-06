/**
 * Returns a debounced wrapper around `fn`: repeated calls within `delayMs`
 * of each other collapse into a single trailing call. The wrapper also
 * exposes `.cancel()` so callers (e.g. a search screen unmounting mid-type)
 * can discard a pending call.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
