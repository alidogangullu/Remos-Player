import { useEffect, useState } from 'react';
import { NativeModules } from 'react-native';

export interface ArtworkPalette {
  dominant: string;
  vibrant: string;
  darkVibrant: string;
  lightVibrant: string;
  muted: string;
  darkMuted: string;
  lightMuted: string;
}

const cache = new Map<string, ArtworkPalette>();

/** The native module reports a swatch the artwork doesn't have as pure black; treat it as missing. */
const MISSING_SWATCH = '#000000';

function normalize(raw: ArtworkPalette): ArtworkPalette {
  const clean = (color: string | undefined) => (color && color.toUpperCase() !== MISSING_SWATCH ? color : '');
  return {
    dominant: clean(raw.dominant),
    vibrant: clean(raw.vibrant),
    darkVibrant: clean(raw.darkVibrant),
    lightVibrant: clean(raw.lightVibrant),
    muted: clean(raw.muted),
    darkMuted: clean(raw.darkMuted),
    lightMuted: clean(raw.lightMuted),
  };
}

/** Mixes `hex` toward black by `amount` (0–1). */
function darken(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `#${channels.map((c) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The two background gradient stops (AirTune's picks: dark muted → dark
 * vibrant). Bright, flat artwork — a radio logo in one saturated color — has
 * neither dark swatch, so those fall back to the artwork's own colors,
 * darkened enough to keep white text readable. `null` when nothing usable.
 */
export function backgroundGradient(palette: ArtworkPalette): [string, string] | null {
  const base = palette.dominant || palette.vibrant || palette.muted;
  const first = palette.darkMuted || (base ? darken(base, 0.55) : '');
  const accent = palette.vibrant || palette.muted || base;
  const second = palette.darkVibrant || (accent ? darken(accent, 0.65) : '') || first;
  return first ? [first, second] : null;
}

/** Android Palette colors for the artwork (ported from AirTune); `null` until ready or when the native module is missing. */
export function useArtworkColors(uri: string | null | undefined): ArtworkPalette | null {
  const [palette, setPalette] = useState<ArtworkPalette | null>(uri ? cache.get(uri) ?? null : null);

  useEffect(() => {
    if (!uri) {
      setPalette(null);
      return;
    }
    const cached = cache.get(uri);
    if (cached) {
      setPalette(cached);
      return;
    }
    const { ImageColors } = NativeModules;
    if (!ImageColors) return;

    let cancelled = false;
    ImageColors.getColors(uri)
      .then((raw: ArtworkPalette) => {
        const result = normalize(raw);
        cache.set(uri, result);
        if (!cancelled) setPalette(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return palette;
}
