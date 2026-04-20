/**
 * Predefined dice candidate pools used by the Compose feature.
 *
 *   - Standard (38)    — the depowered 2/3/5/7/11/13/17/19 list, identical to
 *     `DICE_COMBINATIONS` from the solver. Mirrors the original game's
 *     "normal" dice set.
 *   - Extensive        — every unordered (a, b, c) triple in `[1, 20]`,
 *     filtered to drop game-illegal rolls (all-same triples and triples
 *     with two or more `1`s — see `isLegalDiceTriple`). Built lazily once
 *     on first access; 1,501 entries.
 *   - Æther sample 3d  — the arity-3 slice of the canonical Æther sample
 *     (`AETHER_SAMPLE`), positive small dice in `[2, 16]`. The familiar
 *     starter pool when toggling into Æther — same shape as the standard
 *     dataset, just resolved against the wider Æther matrix.
 *   - Æther full 3d    — every unordered (a, b, c) triple over the full
 *     `AETHER_MODE.diceRange` of `[-10, 32]` (~14k entries). Picks up
 *     negatives and the upper face values that `aetherSample` never
 *     touches; correspondingly slower to rank.
 *
 * `standard` and `extensive` are restricted to the standard
 * `[2, 20]` dice range so they always resolve against
 * `standard.n2k`. `aetherSample` and `aetherFull3d` run against the
 * Æther 3-arity matrix (loaded on demand by Compose when
 * `rules === "aether"`) and so tolerate the wider
 * `AETHER_MODE.diceRange` (negatives included).
 */
import type { DiceTriple } from "../core/types";
import {
  AETHER_MODE,
  DICE_COMBINATIONS as STANDARD,
  STANDARD_MODE,
  isLegalDiceTriple,
} from "@solver/core/constants.js";
import { AETHER_SAMPLE } from "./aetherSample";

const STANDARD_DICE_MIN = STANDARD_MODE.diceRange.min;
const STANDARD_DICE_MAX = STANDARD_MODE.diceRange.max;
const AETHER_DICE_MIN = AETHER_MODE.diceRange.min;
const AETHER_DICE_MAX = AETHER_MODE.diceRange.max;

export type CandidatePoolId =
  | "standard"
  | "extensive"
  | "aetherSample"
  | "aetherFull3d";

export interface CandidatePoolMeta {
  readonly id: CandidatePoolId;
  readonly label: string;
  readonly description: string;
  readonly size: number;
}

const STANDARD_POOL: readonly DiceTriple[] = STANDARD;

let extensiveCache: readonly DiceTriple[] | null = null;
function buildExtensive(): readonly DiceTriple[] {
  if (extensiveCache !== null) return extensiveCache;
  const triples: DiceTriple[] = [];
  // Standard mode's dice range is the source of truth: the bundled
  // `standard.n2k` blob only covers tuples in [diceMin, diceMax], so
  // any triple emitted here is guaranteed to resolve in `DataStore`.
  for (let a = STANDARD_DICE_MIN; a <= STANDARD_DICE_MAX; a += 1) {
    for (let b = a; b <= STANDARD_DICE_MAX; b += 1) {
      for (let c = b; c <= STANDARD_DICE_MAX; c += 1) {
        const triple: DiceTriple = [a, b, c];
        if (!isLegalDiceTriple(triple)) continue;
        triples.push(triple);
      }
    }
  }
  extensiveCache = triples;
  return triples;
}

let aetherSampleCache: readonly DiceTriple[] | null = null;
function buildAetherSample(): readonly DiceTriple[] {
  if (aetherSampleCache !== null) return aetherSampleCache;
  const out: DiceTriple[] = [];
  for (const tuple of AETHER_SAMPLE) {
    if (tuple.length !== 3) continue;
    const a = tuple[0]!;
    const b = tuple[1]!;
    const c = tuple[2]!;
    // No range filter — the Æther 3-arity blob covers
    // `AETHER_MODE.diceRange`, including negatives, so any sample tuple
    // resolves under Æther rules. Compose enforces `rules === "aether"`
    // before letting this pool ship to the resolver.
    out.push([a, b, c]);
  }
  aetherSampleCache = out;
  return out;
}

/**
 * The "give me everything" Æther pool — every unordered triple in the
 * full `AETHER_MODE.diceRange` (currently `[-10, 32]`). Roughly 14k
 * entries; the matrix has full coverage so each one resolves cleanly,
 * and the ranker drops degenerate rolls (>50% unreachable cells)
 * downstream.
 *
 * No `isLegalDiceTriple` filter here — that rule was written for the
 * standard `[1, 20]` set and exists to prevent low-information rolls
 * (all-same, multiple ones). Æther is opt-in chaos; the user picked
 * this pool specifically to see what the wider tuple space does.
 */
let aetherFull3dCache: readonly DiceTriple[] | null = null;
function buildAetherFull3d(): readonly DiceTriple[] {
  if (aetherFull3dCache !== null) return aetherFull3dCache;
  const triples: DiceTriple[] = [];
  for (let a = AETHER_DICE_MIN; a <= AETHER_DICE_MAX; a += 1) {
    for (let b = a; b <= AETHER_DICE_MAX; b += 1) {
      for (let c = b; c <= AETHER_DICE_MAX; c += 1) {
        triples.push([a, b, c]);
      }
    }
  }
  aetherFull3dCache = triples;
  return triples;
}

export function getCandidatePool(id: CandidatePoolId): readonly DiceTriple[] {
  if (id === "standard") return STANDARD_POOL;
  if (id === "aetherSample") return buildAetherSample();
  if (id === "aetherFull3d") return buildAetherFull3d();
  return buildExtensive();
}

export const CANDIDATE_POOLS: readonly CandidatePoolMeta[] = [
  {
    id: "standard",
    label: `Standard (${STANDARD_POOL.length})`,
    description: "The original depowered dice list — fast to load.",
    size: STANDARD_POOL.length,
  },
  {
    id: "extensive",
    label: `Extensive (${buildExtensive().length.toLocaleString()})`,
    description: `Every legal unordered (a, b, c) ∈ [${STANDARD_DICE_MIN}, ${STANDARD_DICE_MAX}]. Slower to fetch.`,
    size: buildExtensive().length,
  },
];

/**
 * Pools surfaced only when Æther mode is unlocked. These are appended
 * to `CANDIDATE_POOLS` by the Compose UI.
 */
export const AETHER_CANDIDATE_POOLS: readonly CandidatePoolMeta[] = [
  {
    id: "aetherSample",
    label: `Æther 3d, positive (${buildAetherSample().length.toLocaleString()})`,
    description: `Arity-3 triples in [2, 16] — the familiar small-positive subrange. Quick to rank.`,
    size: buildAetherSample().length,
  },
  {
    id: "aetherFull3d",
    label: `Æther 3d, full range (${buildAetherFull3d().length.toLocaleString()})`,
    description: `Every arity-3 triple in [${AETHER_DICE_MIN}, ${AETHER_DICE_MAX}] — negatives and large faces included. Slower to rank but uses the matrix you paid to load.`,
    size: buildAetherFull3d().length,
  },
];
