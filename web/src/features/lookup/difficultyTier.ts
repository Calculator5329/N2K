/**
 * Difficulty tier mapping. Centralized so the chunk grid and the
 * single-target view agree on labels + colors.
 *
 * The buckets come from `core/constants.ts` (DIFFICULTY_BUCKETS) but
 * we compute label + chip color in the view layer because color is a
 * presentation concern, not a domain one.
 */
import { DIFFICULTY_BUCKETS } from "@platform/core/constants.js";

export interface DifficultyTier {
  readonly label: string;
  readonly index: number;
  readonly chipBg: string;
  readonly chipFg: string;
}

const LABELS: readonly string[] = [
  "trivial",
  "easy",
  "moderate",
  "hard",
  "very hard",
  "extreme",
  "legendary",
  "mythic",
];

// Subtle, theme-agnostic chips. They sit on top of `--color-surface`
// in both light (tabletop) and dark (noir) themes without clashing.
const CHIP_BG: readonly string[] = [
  "rgba(46, 174, 119, 0.18)", // green
  "rgba(46, 174, 119, 0.32)",
  "rgba(244, 196, 48, 0.28)",  // amber
  "rgba(244, 142, 48, 0.32)",  // orange
  "rgba(217, 78, 38, 0.32)",   // red
  "rgba(155, 39, 176, 0.32)",  // purple
  "rgba(40, 40, 40, 0.55)",    // near-black
  "rgba(0, 0, 0, 0.78)",       // black
];

const CHIP_FG: readonly string[] = [
  "var(--color-ink)",
  "var(--color-ink)",
  "var(--color-ink)",
  "var(--color-ink)",
  "var(--color-ink)",
  "var(--color-bg)",
  "var(--color-bg)",
  "var(--color-bg)",
];

export function tierForDifficulty(difficulty: number): DifficultyTier {
  let idx = DIFFICULTY_BUCKETS.findIndex(
    ([min, max]) => difficulty >= min && difficulty <= max,
  );
  if (idx < 0) idx = DIFFICULTY_BUCKETS.length - 1;
  const safeIdx = Math.min(idx, LABELS.length - 1);
  return {
    label: LABELS[safeIdx]!,
    index: safeIdx,
    chipBg: CHIP_BG[safeIdx]!,
    chipFg: CHIP_FG[safeIdx]!,
  };
}
