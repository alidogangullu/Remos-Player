import axios from 'axios';
import { parseLRC, LyricLine } from './lrcParser';

export interface LyricsResponse {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\[with.*?\]/gi, '')
    .replace(/\(remastered.*?\)/gi, '')
    .replace(/\[remastered.*?\]/gi, '')
    .replace(/\(deluxe.*?\)/gi, '')
    .replace(/\(explicit.*?\)/gi, '')
    .replace(/\(live.*?\)/gi, '')
    .replace(/- Single/gi, '')
    .replace(/- Remastered/gi, '')
    .replace(/- EP/gi, '')
    .replace(/\s\s+/g, ' ')
    .trim();
}

/**
 * Fetches synced LRC lyrics from LRCLib API for a given track.
 */
export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  durationMs?: number
): Promise<{ lines: LyricLine[]; rawSynced?: string; plain?: string } | null> {
  const cleanedTrack = cleanTitle(trackName);
  const durationSec = durationMs ? Math.round(durationMs / 1000) : 0;

  try {
    // Strategy 1: Exact get
    const params: Record<string, string> = {
      track_name: cleanedTrack,
      artist_name: artistName,
    };
    if (albumName) params.album_name = albumName;
    if (durationSec > 0) params.duration = durationSec.toString();

    const res = await axios.get<LyricsResponse>('https://lrclib.net/api/get', {
      params,
      timeout: 4000,
      headers: {
        'User-Agent': 'SonosTV/1.0 (https://github.com/sonostv)',
      },
    });

    if (res.data?.syncedLyrics) {
      return {
        lines: parseLRC(res.data.syncedLyrics),
        rawSynced: res.data.syncedLyrics,
        plain: res.data.plainLyrics,
      };
    }
  } catch {
    // Try search fallback
  }

  try {
    // Strategy 2: Search fallback
    const searchRes = await axios.get<LyricsResponse[]>('https://lrclib.net/api/search', {
      params: {
        q: `${cleanedTrack} ${artistName}`,
      },
      timeout: 4000,
      headers: {
        'User-Agent': 'SonosTV/1.0 (https://github.com/sonostv)',
      },
    });

    const matches = searchRes.data;
    if (Array.isArray(matches) && matches.length > 0) {
      const matchWithSynced = matches.find((m) => m.syncedLyrics && m.syncedLyrics.trim().length > 0);
      if (matchWithSynced?.syncedLyrics) {
        return {
          lines: parseLRC(matchWithSynced.syncedLyrics),
          rawSynced: matchWithSynced.syncedLyrics,
          plain: matchWithSynced.plainLyrics,
        };
      }
    }
  } catch {
    // Return null if search also fails
  }

  return null;
}
