/**
 * Predefined dice candidate pools used by the Compose feature.
 *
 *   - Standard (38)   — the depowered 2/3/5/7/11/13/17/19 list, identical to
 *     `DICE_COMBINATIONS` from the solver. Mirrors the original game's
 *     "normal" dice set.
 *   - Extensive        — every unordered (a, b, c) triple in `[1, 20]`,
 *     filtered to drop game-illegal rolls (all-same triples and triples
 *     with two or more `1`s — see `isLegalDiceTriple`). Built lazily once
 *     on first access; 1,501 entries.
 *   - Æther sample     — the arity-3 slice of the canonical Æther sample
 *     (`AETHER_SAMPLE`). Only exposed in Æther mode (see the gating in
 *     `ComposeView`). Smaller than `extensive` but the *same* triples
 *     used elsewhere in Æther tooling so generated competitions sit on
 *     a familiar data substrate.
 *
 * All pools must yield triples whose values fall inside the standard
 * `[1, 20]` range — Compose evaluates each candidate against
 * `DataStore.detail`, which only carries stats for the bundled dataset.
 */
import type { DiceTriple } from "../core/types";
import {
  DICE_COMBINATIONS as STANDARD,
  isLegalDiceTriple,
} from "@solver/core/constants.js";
import { AETHER_SAMPLE } from "./aetherSample";

export type CandidatePoolId = "standard" | "extensive" | "aetherSample";

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
  for (let a = 1; a <= 20; a += 1) {
    for (let b = a; b <= 20; b += 1) {
      for (let c = b; c <= 20; c += 1) {
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
    if (a < 1 || c > 20) continue;
    out.push([a, b, c]);
  }
  aetherSampleCache = out;
  return out;
}

export function getCandidatePool(id: CandidatePoolId): readonly DiceTriple[] {
  if (id === "standard") return STANDARD_POOL;
  if (id === "aetherSample") return buildAetherSample();
  return buildExtensive();
}

export const CANDIDATE_POOLS: readonly CandidatePoolMeta[] = [
  {
    id: "standard",
    label: "Standard (38)",
    description: "The original depowered dice list — fast to load.",
    size: STANDARD_POOL.length,
  },
  {
    id: "extensive",
    label: "Extensive (1,501)",
    description:
      "Every legal unordered (a, b, c) ∈ [1, 20]. Slower to fetch.",
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
    label: "Æther sample (3d)",
    description: "Arity-3 slice of the canonical Æther sample. Same triples used in Explore / Visualize.",
    size: buildAetherSample().length,
  },
];
