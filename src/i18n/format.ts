import i18n from 'i18next';

/**
 * Locale-aware formatting that follows the app's language (Settings ›
 * Language), not just the device's — `toLocale*String([])` would ignore an
 * in-app language choice.
 */

/** "14:05" / "2:05 PM", depending on the app language. */
export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/**
 * A calendar date ("21 Oct 2026" / "Oct 21, 2026"). Accepts an ISO
 * `YYYY-MM-DD` string; anything unparseable is returned unchanged.
 */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  // Built from parts at noon UTC so no timezone shifts it to the previous day.
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Uppercase with the app language's casing rules (Turkish i → İ, not I). */
export function toDisplayUpperCase(text: string): string {
  return text.toLocaleUpperCase(i18n.language);
}
