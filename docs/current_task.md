# Current task — Solver perf + Æther curated blobs + `.n2k` v2++

**Status:** Phase 1 ✅ complete; Phase 2 B1 + B2 + B3 ✅ complete;
caller-migration cleanup pending; Phase 3 (`.n2k` v2++) up next.

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
- [x] **B2 canonical-form post-processor** —
  `src/services/canonicalForm.ts` collapses perm-equivalent
  results from `allSolutions` into a sorted
  `CanonicalSolution[]` (`equation` + `multiplicity`).
  Run-aware: respects N2K's strict left-to-right evaluation by
  reordering operands only inside maximal same-precedence-class
  runs (`{+,-}` and `{*,/}`). Self-checks every result by
  re-evaluating the canonical equation and throwing if it ≠
  original total. Web `solverWorker.ts` + `AllEquationsList.tsx`
  now route through it and render an `×N orderings` badge plus a
  parenthetical raw count. Real measured reductions on a sample:
  std `[2,3,5]→17` 57→34 (1.7×), æther `[2,3,5,7]→47`
  1246→278 (4.5×), æther `[2,2,5,7]→175` 1013→228 (4.4×).
- [ ] **Migrate remaining callers** to canonical/B&B paths;
  retire old paths where safe (e.g. exporter could collapse
  before serialization, but that changes the wire format and
  belongs in Phase 3).

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
- **`difficultyLowerBound` `mode.exponentCap` bug fixed**
  (B2 cleanup pass): the `??` fallback assumed
  `mode.exponentCap` was a number, but it's a function
  `(die) => number`. The original code computed
  `Math.pow(maxBase, fn) → NaN`, silently skipping the
  free-dice tightening branch. Tightening it correctly broke
  soundness on standard arity-3 cells where `actualDiff ≈ 0`,
  so the branch was deleted entirely. Net: LB is now provably
  sound and a tiny bit more conservative than the silently-
  broken version was. The `findEasiestForTuple` per-step
  prunes carry the speedup load; benches still beat baseline
  (e.g. arity-4 `high target` 576ms → 307ms, arity-5 `primes`
  1438ms → 1102ms).
- **Canonical-form run model:** N2K is left-to-right with no
  precedence, so `2 + 3 * 5 = 25` (not 17). A "run" is a maximal
  span of operands joined by ops of the same class (`{+,-}` vs
  `{*,/}`). Inside a run the operand multiset is commutative;
  reordering them changes the wire form but not the value, **as
  long as** the new run-leader has weight `+1` (a swap-up
  promotion handles the case where the sort places a `−1`-weight
  operand at position 0). The boundary op between two runs is
  *not* preserved verbatim — it's regenerated from the new
  leader's weight, since in left-to-right evaluation the
  boundary op applies directly to the first operand of the new
  run. (We initially preserved it and got `2 * 3^5 - 7^3 + 5^0 =
  144` collapsing to `2 * 3^5 - 5^0 + 7^3 = 828`. Test caught
  it.)
