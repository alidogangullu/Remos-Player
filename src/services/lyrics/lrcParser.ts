export interface LyricLine {
  time: number; // Time in milliseconds
  text: string;
}

/**
 * Parses LRC formatted string into an array of LyricLine objects.
 * Supported formats: [mm:ss.xx] or [mm:ss.xxx]
 */
export function parseLRC(lrc: string): LyricLine[] {
  if (!lrc) return [];

  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;

  for (const line of lines) {
    const matches = Array.from(line.matchAll(timeRegex));
    if (matches.length > 0) {
      const text = line.replaceAll(timeRegex, '').trim();

      for (const match of matches) {
        const minutes = Number.parseInt(match[1], 10);
        const seconds = Number.parseInt(match[2], 10);
        const millisecondsStr = match[3];

        let milliseconds = Number.parseInt(millisecondsStr, 10);
        if (millisecondsStr.length === 2) {
          milliseconds *= 10;
        }

        const totalMs = minutes * 60 * 1000 + seconds * 1000 + milliseconds;

        result.push({
          time: totalMs,
          text,
        });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}
