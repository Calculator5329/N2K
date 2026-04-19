/**
 * Maps a difficulty score to a color on a theme-appropriate scale.
 *
 * Each theme provides its own list of stops via `core/themes.ts`. The
 * scale is non-linear by design — most "easiest" difficulties live in the
 * 0–20 band, so themes weight that region for visual contrast.
 */
import type { ThemeId } from "../../core/themes";
import { THEMES } from "../../core/themes";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ScaleStop {
  at: number;
  color: RGB;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function rgb(c: RGB): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/** Build a `(difficulty) => css color` function from an arbitrary stop list. */
export function makeColorForDifficulty(
  stops: readonly ScaleStop[],
): (diff: number) => string {
  return (diff: number) => {
    const d = Math.max(0, Math.min(100, diff));
    for (let i = 1; i < stops.length; i += 1) {
      const lo = stops[i - 1]!;
      const hi = stops[i]!;
      if (d <= hi.at) {
        const t = (d - lo.at) / (hi.at - lo.at);
        return rgb(lerpColor(lo.color, hi.color, t));
      }
    }
    return rgb(stops[stops.length - 1]!.color);
  };
}

/** Convenience: get a scale + impossible color for a given theme id. */
export function paletteFor(theme: ThemeId): {
  colorForDifficulty: (diff: number) => string;
  impossibleColor: string;
  stops: readonly ScaleStop[];
} {
  const t = THEMES[theme];
  return {
    colorForDifficulty: makeColorForDifficulty(t.scale.stops),
    impossibleColor: rgb(t.scale.impossible),
    stops: t.scale.stops,
  };
}
