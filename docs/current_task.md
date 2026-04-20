# Current task — Solver perf + Æther curated blobs + `.n2k` v2++

**Status:** Phase 1 ✅ complete; Phase 2 B1 + B3 ✅ complete; B2
canonical-form solver in progress.

The full plan lives in `docs/plan-solver-perf-and-n2k-v2.md`. This file
tracks day-to-day execution and decisions made along the way.

## Why we're doing this

User pinpointed an honest inefficiency in the solver: for arity 5 we
brute-force 120 perms × thousands of exp-tuples × 256 op-tuples to
return *one* easiest equation. Most of that work is redundant
(canonical-form-equivalent equations) or unnecessary (B&B can prune
80%+ of the search space).

While we're rewriting the hot path, also:

- Standard-mode "All equations" panel currently shows 44 cosmetic
  perms of the same equation; canonical-form dedup makes it ~15
  meaningfully different equations.
- Æther arity-4/5 has zero precomputed coverage today — every lookup
  hits the worker. With the perf wins, we can ship curated `.n2k`
  blobs for the common rolls (~20 MB total) and have arity-4/5
  feel as snappy as standard.
- The `.n2k` v1 format leaves ~10× shrink on the table that we can
  pick up in a v2++ format with bitmap-keyed records, cross-chunk
  dictionaries, sameShape bits, and adaptive difficulty quantization.

## Locked decisions (from planning)

- **Commons curation:** dice ∈ {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  15, 20}, no 1s, ≤2 of any value
- **Legality (universe):** no 1s rule is ≤1 one per roll, ≤(N−1)
  of any value, no 0s
- **0 die:** banned at Mode level via `legalDieValue(d)`
- **Worker streaming:** cursor-based
- **Canonical-form ordering:** smallest-first within a commutative
  span (e.g. `2 + 3 + 5`, not `5 + 3 + 2`)
- **B&B lower bound:** new `difficultyLowerBound(prefix, mode)`
  alongside the full evaluator, asserted ≤ for 1000 random prefixes
  per mode

## Phase 1 checklist (foundations) — ✅ DONE

- [x] **`src/core/legality.ts`** — `isLegalDiceTuple(dice, mode)`
- [x] **`mode.legalDieValue?(d)`** field on `Mode` (Æther excludes 0)
- [x] **`enumerateLegalTuples(arity, mode, predicate?)`**
- [x] **`isLegalDiceTriple` becomes a 3-arity wrapper**
- [x] **Bench harness** — `npm run bench:solver`, baseline written
  to `docs/bench-baseline.md`

## Phase 2 checklist

- [x] **B3 inner-loop wins** — interleaved exp+op enumeration,
  inlined `applyOperator`, typed-array exp/op buffers, per-step
  magnitude + reach pruning
- [x] **B1 branch-and-bound `easiestSolution`** — `findEasiestForTuple`
  carries `bestDiff` across perms and across subset arities; sound
  `difficultyLowerBound` enables cross-perm pruning
- [x] **Parity test** — `tests/solver-bnb-parity.test.ts` proves B&B
  result matches brute-force `sweepOneTuple` on standard arity-3
  exhaustively + Æther arity-4 probe targets
- [ ] **B2 canonical-form solver** — collapse perm-equivalent
  results from `allSolutions` into a `(canonical, multiplicity)`
  list. Needed so the "All equations" list at arity 4/5 stops
  flooding with 1000+ near-duplicates.
- [ ] **Migrate callers** to canonical/B&B paths; retire old paths
  where safe.

## Subsequent phases (overview, see plan for detail)

- **Phase 3 (3–4 days):** v2++ chunk format → v2++ blob with index
  → cross-chunk dict builder → bake script extensions
- **Phase 4 (1–2 days):** loader integration → AetherLookupView
  blob-or-worker routing → AllEquationsList streaming "show more"
- **Phase 5 (1 day):** regen `standard.n2k` v2++ → bake
  `aether-arity4-commons.n2k` + `aether-arity5-commons.n2k` →
  remove v1 codec

## Open notes

- **LB tightness vs soundness trade-off:** the first LB cut omitted
  the `tenFlag`, the `<0` floor, and the `^0`/`^1` bonuses. It was
  ~10% tighter and pruned more aggressively but failed parity on
  304 standard arity-3 cases. Replaced with a sound version that
  uses an information-theoretic bound on "max free dice" (how many
  `^0`/`^1` exps can fit while the remaining dice still multiply
  up to `|total|`). Some sub-ms easy cases regressed to single-ms;
  net is still a clear win and now verifiably correct.
- **Arity-5 parity test deferred** — single `sweepOneTuple` over the
  arity-5 perm space is multi-second. Coverage comes transitively
  through arity-4 parity (same B&B code paths) + the existing
  `tests/solver.test.ts` arity-5 fixtures.
- **Reach-prune formula:** `|final| ≤ |acc|·P + P` where `P =
  prod(maxBaseRemaining)`. Sound (every multiply scales by ≤
  per-level max base; every additive op contributes ≤ per-level
  max base, summed ≤ product when ≥2 bases ≥2). Tight in practice.
