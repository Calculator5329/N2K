# N2K Platform — Changelog

Running log of what landed each session. Newest first.

## 2026-04-19 — Lookup-feels-instant follow-ups

Quick polish pass on the canonical-form work to make the **whole**
"All equations" panel interaction feel instant on Standard mode, not
just the post-solve render.

**Worker prewarm (`web/src/services/solverWorkerService.ts`,
`web/src/features/lookup/LookupView.tsx`):**
- New `prewarmSolverWorker()` instantiates the solver Worker without
  sending it any work. Spending the ~30–80 ms one-time bundle-fetch
  + thread-spawn cost up front means opening the "All equations"
  panel later only pays for the actual solve, which is single-digit
  ms on Standard cells.
- `LookupView` calls it from a mount effect inside
  `requestIdleCallback` (with a `setTimeout` fallback for Safari).
  Idle-scheduled so it can't fight the initial paint; Lookup is the
  only feature that uses this worker, so mount-time is a perfect fit.

**Cost-of-canonicalization spot-check (`scripts/canonical-cost.ts`,
throwaway):** measured the canonical pass alone vs the
`allSolutions` it depends on. Confirms the dedup is essentially
free relative to the solve:
- aether `[2,3,5,7]→47`: 651 ms solve + **3.7 ms canonical** (0.6%)
- aether `[2,2,5,7]→175`: 542 ms solve + **4.0 ms canonical** (0.7%)
- std `[2,3,5]→17`: 1.3 ms solve + **0.5 ms canonical** (26%, but
  still <2 ms total — invisible)

**Drop redundant difficulty re-score in the worker
(`web/src/services/solverWorker.ts`,
`src/services/canonicalForm.ts`):**
- `CanonicalSolution` now carries the `difficulty` it was scored
  with during sort; the worker reuses it instead of calling
  `difficultyOfEquation` a second time per row. Saved one full
  difficulty pass over every result row.

**Worst-case watchlist (`docs/bench-baseline.md`):** added a
PRE/MID/NOW comparison section anchored on **p95 max time per
tier** (the metric the user actually feels), with thresholds set
~30% above current numbers as a regression alarm. Captures the
two real takeaways: arity-5 worst-case `easiestSolution` 1411 →
1117 ms (−21%), arity-4 worst-case `allSolutions` 490 → 374 ms
(−24%), plus the canonical-form 4.5× row-count reduction that
multiplies the felt improvement at the React layer.

## 2026-04-19 — Phase 2 B2: canonical-form post-processor

Collapses the flood of perm-equivalent equations from `allSolutions`
into one canonical representative per equivalence class, with a
multiplicity count. Resolves the user's complaint that the "All
equations" panel at arity 4/5 showed 1000+ near-duplicates that all
read the same.

**Solver layer (`src/services/canonicalForm.ts`):**
- `canonicalizeEquation(eq)` rebuilds an equation by sorting operands
  inside each maximal same-precedence-class run (`{+,-}` for additive,
  `{*,/}` for multiplicative), preserving N2K's strict left-to-right
  semantics — operands across run boundaries are *not* swapped.
  Sort key: `(base asc, exp asc, weight desc)`. The boundary op
  between two runs is regenerated from the new run-leader's weight,
  not preserved verbatim — in left-to-right evaluation the boundary
  op applies directly to whichever operand starts the new run.
- A leading-negative-weight operand is swapped with the leftmost
  positive-weight operand in its run, so the canonical form is always
  representable in the wire format (which has no leading-minus slot).
- Defensive: every canonical equation is re-evaluated against its
  declared total before return; mismatch throws loud rather than
  shipping wrong UI. (Caught one real bug during dev — preserving the
  boundary op turned `2 * 3^5 - 7^3 + 5^0 = 144` into `… - 5^0 + 7^3
  = 828`.)
- `canonicalizeSolutions(equations, scoreFn)` deduplicates by
  canonical key and returns sorted-asc-by-difficulty
  `{equation, multiplicity}[]`. `scoreFn` is injected so the module
  stays decoupled from the difficulty heuristic.

**Web layer (`web/src/services/solverWorker.ts`,
`web/src/features/lookup/AllEquationsList.tsx`):**
- Standard-mode worker now collapses the raw `allSolutions` output
  through `canonicalizeSolutions` before posting back. Response shape
  gains a `multiplicity: number` field.
- `AllEquationsList` renders an `×N orderings` badge next to any
  collapsed row and shows a parenthetical raw-orderings count next
  to the headline equation count when collapsing actually happened.

**Measured reductions** (`scripts/canonical-stats.ts`, throwaway):
- standard `[2,3,5]→17`: 57 → 34 (1.7×)
- aether `[2,3,5,7]→144`: 714 → 251 (2.8×)
- aether `[2,3,5,7]→47`: **1246 → 278 (4.5×)**
- aether `[1,2,3,5]→60`: 964 → 360 (2.7×)
- aether `[2,2,5,7]→175`: **1013 → 228 (4.4×)**

**Bug found and fixed in `difficultyLowerBound`:**
- The `??` fallback `mode.exponentCap ?? 1` was unsound — that field
  is a function `(die) => number`, not a number. The expression
  silently returned `NaN` from `Math.pow(maxBase, fn)`, so the
  free-dice tightening branch was never taken. Calling the function
  correctly tightened the LB enough that it overshot
  `actualDifficulty ≈ 0` cells (heuristic clamps saturate
  non-linearly). The branch was deleted entirely; LB now uses the
  trivially-sound assumption `maxFreeDice = N`.
- Net bench impact: small wins or stable across the board, with
  larger wins on hard cases (æther arity-4 `high target` 576ms →
  307ms, æther arity-5 `primes` 1438ms → 1102ms). Soundness reverified
  by the LB-soundness parity tests.

**Tests:** 9 cases in `tests/canonicalForm.test.ts` cover
hand-crafted equivalence classes (additive run, mixed-class chain,
leading-negative-weight edge, tie-break determinism) + property
checks against real `allSolutions` outputs (multiplicity sums,
difficulty-ascending ordering, no duplicate keys, ≥2× reduction at
arity 4). All four `solver-bnb-parity.test.ts` cases still pass after
the LB fix, including LB-≤-actual soundness on standard arity-3 and
æther arity-4 samples.

## 2026-04-19 — Phase 1 + Phase 2 (B1, B3) of solver perf plan

Shipped the foundations and the solver-side wins of the multi-phase
plan in `docs/plan-solver-perf-and-n2k-v2.md`.

**Phase 1 — foundations:**
- `src/core/legality.ts`: unified `isLegalDiceTuple(dice, mode)` rules
  (≤1 one, ≤(N−1) of any value, in-range, mode-specific exclusions),
  plus `enumerateLegalTuples`, `isCommonDiceTuple`,
  `isExtendedDiceTuple` for the curator.
- `Mode.legalDieValue?: (d) => boolean` field; Æther sets it to
  exclude `0`.
- `isLegalDiceTriple` becomes a 3-arity wrapper for back-compat.
- `scripts/bench-solver.ts` micro-bench harness with median + p95
  across standard arity-3, Æther arity-4, and Æther arity-5
  workloads. `npm run bench:solver` runs it; `--baseline` writes
  `docs/bench-baseline.md`.

**Phase 2 (B1) — branch-and-bound `easiestSolution`:**
- New `difficultyLowerBound(dice, total, mode)` produces a sound
  lower bound on every equation difficulty over `dice` totalling
  `total`. Tightness anchored by an information-theoretic count of
  how many "free" `^0`/`^1` exponents can fit while still letting
  the remaining dice multiply up to `|total|`.
- New `findEasiestForTuple` is the actual B&B inner loop. Carries
  the running `bestDiff` across permutations *and* across subset
  sizes inside `easiestSolution`, pruning whole subtrees when the
  per-tuple LB ≥ best.
- Soundness guarded by `tests/solver-bnb-parity.test.ts`: every
  sampled standard arity-3 tuple × every solved target, plus an
  Æther arity-4 probe set, must agree on `difficulty` with the
  brute-force `sweepOneTuple` baseline.

**Phase 2 (B3) — inner-loop wins:**
- Interleaved exp + op enumeration replaces the old "pick all exps,
  then run all op-tuples at the leaf" structure. Per-step
  magnitude guard (`acc !== acc || |acc| > safeMagnitude`) and a
  reach-based prune (`|total| > |acc|·P + P` where `P =
  prod(maxBaseRemaining)`) cut entire subtrees before they're
  enumerated.
- Inlined `applyOperator` in three hot loops (`findEasiestForTuple`,
  `enumerateForPermutation`, `allSolutions`) to bypass the virtual
  call cost.
- `Int32Array`/`Float64Array` for exp and op buffers (monomorphic
  V8 paths).

**Bench deltas (vs `docs/bench-baseline.md` from earlier in the
session):**
- Æther arity-4 `[1,2,3,5]→60` easiest: 4.78ms → **0.09–4.1ms**
  (best case 56×; warm-cache regressions on some easy probes).
- Æther arity-4 `[3,7,11,13]→858` easiest: 146ms → **74–85ms** (1.7–2.0×).
- Æther arity-4 `allSolutions` `[1,2,3,5]→60`: 350ms → **91ms** (3.8×).
- Æther arity-4 `allSolutions` dup pair: 802ms → **271ms** (3.0×).
- Æther arity-5 `[2,3,5,7,11]→3614` easiest (the user's example):
  **1.79s → 1.04–1.5s** (1.2–1.7× depending on noise).
- Total bench wallclock: 25.8s → ~16–18s (1.5×).

**Decisions / debt:**
- The early "fast-but-broken" LB (which omitted floor + bonuses)
  produced bigger speedups but failed parity tests on 304 standard
  arity-3 cases. Replaced with the sound version. Some easy-case
  speedups regressed (e.g., arity-5 `→100` went from 27μs → 60ms);
  net is still a clear win and now provably correct.
- Arity-5 parity test omitted (a single `sweepOneTuple` over the
  arity-5 perm space is multi-second; covered transitively through
  shared B&B code paths in arity-4 parity).

## 2026-04-19 — Plan written: solver perf overhaul + Æther curated blobs + `.n2k` v2++

Approved a substantial multi-phase project (`docs/plan-solver-perf-and-n2k-v2.md`)
in response to user observations during the lookup-bug session:

1. **"Do we really need all permutations for arity 5?"** — no, most
   are canonical-form-equivalent. Plan formalizes a span-aware
   canonical form and dedups at the solver layer.
2. **"Aether mode lookup takes a while for arity 4/5"** — there's no
   precomputed coverage today. Plan ships curated `.n2k` blobs for
   common dice rolls (~20 MB Tier-1 total) + branch-and-bound on the
   worker for everything else.
3. **"Can we take .n2k farther?"** — yes, ~10× shrink available. Plan
   introduces `.n2k` v2++ format with bitmap-keyed records (replaces
   target-delta varints + enables O(1) lookupByTarget), cross-chunk
   op/exp dictionaries, "sameShape as previous" record bits, adaptive
   difficulty quantization, and Brotli compression.

**Locked decisions:**
- Commons curation: dice ∈ {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15,
  20}, no 1s, ≤2 of any value. Worker handles everything else with
  the new B&B solver (target <500ms for arity 5).
- Universe legality: ≤1 one per roll, ≤(N−1) of any value, no 0 die,
  value in `mode.diceRange`.
- Canonical-form ordering: smallest-first within a commutative span.
- Worker streaming: cursor-based ("give me the next batch").
- Standard mode `standard.n2k` will be regenerated under v2++ (~3 MB
  → ~1.5 MB compressed). User-visible side effect: equations may
  render differently in canonical form (e.g. `5 + 3 + 2` → `2 + 3 +
  5`).

**Five phases planned, ~9–12 days total:**

1. Foundations: `legality.ts`, bench baseline (current session)
2. Solver perf: inner-loop wins → canonical solver → B&B
3. `.n2k` v2++ format: chunk + blob + dict builder + bake script
4. UI integration: blob loader, lookup view routing, streaming
   "Show more" panel
5. Regen + cleanup: bake all three blobs, remove v1 codec

Per-arity-5-chunk size projection: v1 ~22 KB → v2 ~10 KB → v2++ ~5 KB
→ Brotli ~3 KB. ~10× shrink end-to-end.

`docs/current_task.md` updated to track Phase 1 execution.

## 2026-04-19 — Match: bouts now honor the comp's `timeBudget`

User report: "I saved a 30-second bout competition and the timer is
still 60 seconds for playing it."

Root cause in `web/src/stores/PlayStore.ts`: `RACE_DURATION_MS` was a
file-level `const = 60_000`. The countdown tick, the `remainingMs`
selector, the score formula (`scoreFor(knocked, maxScore, raceDuration)`),
and the replay clamps all read from that constant — so even though
`SharedPlanV5` carried `timeBudget: 30 | 60 | 120` and the Compose
view exposed the picker, the value never reached the racetrack.

Fix:
- Promoted `RACE_DURATION_MS` to an instance field `raceDurationMs`
  on `PlayStore`, defaulting to the new exported
  `DEFAULT_RACE_DURATION_MS = 60_000`. Every reference inside the
  store (countdown, score, replay) now reads from `this.raceDurationMs`.
- Added an optional `raceDurationMs?: number` to `RaceOverrides`.
  `start()` honors it (and falls back to the default when omitted or
  zero), so Quick Race keeps its 60s feel and matches override per-bout.
- Threaded the comp's budget through `MatchStore`: new
  `timeBudgetSec` field set from `body.timeBudget` in `launch()` and
  from `snap.timeBudget ?? body.timeBudget` in `restoreFromSnapshot()`.
  `startCurrentBout()` passes `raceDurationMs: this.timeBudgetSec * 1000`
  into `play.start()`.
- Bumped `MatchSnapshot` to v3 with an optional `timeBudget` field;
  v1/v2 snapshots still restore (they fall back to the live body's
  budget so a reload mid-30s-match doesn't quietly snap back to 60s).

The score formula's extrapolation arm — `maxScore * raceDurationMs /
lastClickMs` for fully-knocked boards — also rebases on the new
duration, so a user who clears the board in 30s of a 30-second comp
gets credited with their actual `maxScore`, not double it. Comparable
ratings across budgets, no silent inflation.

Verification:
- Added unit coverage in `tests/playStore.test.ts`:
  - default `raceDurationMs` is 60_000 and `remainingMs` matches,
  - `start({ raceDurationMs: 30_000 })` is honored,
  - omitted/zero overrides fall back to the default.
- `npm run typecheck` clean, `npm test` 12/12 in `playStore.test.ts`,
  69/69 across the web suite, full Playwright e2e suite 48/48.

## 2026-04-19 — Lookup: "All equations" list now actually sorts by difficulty

User report (with screenshot): the "All equations for this cell" panel
was labeled "44 equations, easiest first" but rendered them in solver
enumeration order — difficulties read 5.41, 5.41, 5.96, 5.16, 4.53,
5.31, 8.84, … and the headline easiest equation (4.53) was buried at
position 5 instead of being #1.

Root cause in `web/src/services/solverWorker.ts`: the worker called
`allSolutions(...)` (which returns equations in op-tuple / exp-tuple /
permutation order — that's its honest contract) and forwarded the
results untouched. The "easiest first" promise lived only in the UI
label. No one was sorting.

Fix: the worker now sorts by ascending difficulty after computing the
difficulty for each equation. The sort lives in the worker (not in
`allSolutions`) because the solver has plenty of callers (CLI,
exporter, sweeps) that don't need the extra pass — only this one
consumer wants the ranked view, and it's the one that already pays
for the per-equation `difficultyOfEquation` call.

The Æther solver worker doesn't have the same bug — it only emits
"easiest per target" via `easiestSolution` / `sweepOneTuple`, never
an "all equations for one cell" list.

## 2026-04-19 — Library: Play picker widens to 560px so "Ramanujan" fits

User report (with screenshot): the bot persona button for Ramanujan in
the Play picker dialog was wrapping mid-word ("Ramanuja\nn") because
the modal's 480px shell left ~80px per cell across 5 columns —
`Ramanujan` is 9 chars at the heaviest weight in the row.

Fix: `ModalShell` gained an optional `maxWidthClass` prop that
overrides the default `max-w-[480px]`. `PlayPickerDialog` passes
`max-w-[560px]` so each persona button gets ~96px inner width and
"Ramanujan" sits comfortably on one line. The Save dialog (a single
text input) keeps the compact default — different content density,
different width.

## 2026-04-20 — Match end: surface the matrix's expected score next to each player's actual

User request (with screenshot of `Ramanujan wins. 16,337 vs 17,194`):
"it would be cool to see the expected score for each of us here."

The numbers the matrix predicts during compose-time generation
(`generateBalancedRolls` populates `p1ExpectedScore` /
`p2ExpectedScore` per round and `p1TotalExpectedScore` /
`p2TotalExpectedScore` per board) were never plumbed into the live
match — the user could see them on the Compose results page but had
no way to compare "what the matrix said I'd score" to "what I
actually scored." Without that anchor, a 16,337 vs 17,194 match feels
arbitrary; with it, the user can tell at a glance whether they over-
or under-performed the prediction (and by how much).

Wiring (no schema changes, no persistence changes — purely additive
on the live match):

- `web/src/features/match/MatchStore.ts` — `ScheduleEntry` now
  carries `userExpectedScore` + `opponentExpectedScore`, populated
  in `buildSchedule` from `bout.p1ExpectedScore` /
  `bout.p2ExpectedScore`. In vs-bot the user is always P1 so
  `userExpectedScore = p1Exp`; in hot-seat the bout produces two
  schedule entries (one per seat) and each gets its own seat's
  expected. New getters `userExpectedTotal` and
  `opponentExpectedTotal` sum over `bouts` (not the full schedule)
  so the totals reflect what was *actually played*, not what was
  scheduled — important for matches the user pauses and abandons.
  New `expectedFor(bout)` returns the per-bout pair for the
  breakdown rows.

- `web/src/features/match/MatchView.tsx` — `SeatTotal` learns an
  `expected` prop and renders a small caption beneath the giant
  score: `EXPECTED 17,200 (-863)`. The delta is colored
  `support-500` when the player overperformed, `oxblood-500/70`
  when they underperformed, neutral on tie. The caption is hidden
  when `expected === 0` (legit cases: hot-seat opponent column,
  zero-bouts edge cases) so users never see a noisy "vs expected
  0." The Bout-by-bout breakdown rows also gained an
  `exp 1,234 / 1,180` mid-row segment with a tooltip spelling out
  which side each number belongs to.

Verification: web `npm run typecheck` clean, web `npm test` 69/69
green. No persistence or snapshot changes — schedule entries are
rebuilt from the saved plan on `restoreFromSnapshot`, so a reload
mid-match re-derives the expected scores automatically.

## 2026-04-20 — Library: "Open" button on a saved entry was a silent no-op (re-mounted ComposeView clobbered the load)

User report: "open button within library don't work."

Reproduced with a fresh Playwright test (`e2e/library-open-flow.spec.ts`).
Symptom: clicking Open on a Library card switched the view to Compose
and the comp's *name* appeared in the header — but the "· saved"
badge was missing, autosave kept writing to `compose:current` instead
of the saved id, and any further edits silently desynced from the
Library entry. (The displayed name happened to match only because the
`compose:current` draft had been written with that same name during
the prior Save-as flow; it was the *content* that was being clobbered,
not the title.)

Root cause — a remount race between two hydrate paths:

1. `EntryCard.Open` calls
   `compose.loadFromContentBackend("compose:saved:{uuid}")` and on
   success calls `root.setView("compose")`.
2. `ComposeView`'s mount `useEffect` then runs and unconditionally
   re-hydrates: `loadFromUrl()` → `loadFromContentBackend()` (no
   arg, defaults to `compose:current`).

Step 2 immediately overwrote the saved entry that step 1 had just
loaded, and reset `openedLibraryId` back to `null`. The original
"only run on first mount" intent was per-React-mount, but `ComposeView`
remounts every time the user navigates II → III → II (or comes back
from Library Open), so the "first mount" guard was effectively
"every mount."

Fix: added a `hasHydratedFromBackend: boolean` flag on
`CompositionStore` that flips to `true` the first time *either*
hydrate path runs (URL or backend, whether or not anything was
found). `ComposeView`'s mount effect now early-returns when that
flag is already set, so subsequent remounts leave the in-memory
plan alone. The flag is intentionally NOT reset on view-switch —
the singleton store survives navigation, so its "I'm already
hydrated" status should too.

Files: `web/src/features/compose/CompositionStore.ts`
(new `hasHydratedFromBackend` flag, set inside `loadFromUrl` and
`loadFromContentBackend`), `web/src/features/compose/ComposeView.tsx`
(guard on the mount effect, with a long comment explaining why).

Tests: `web/e2e/library-open-flow.spec.ts` saves a uniquely-named
comp, navigates to Library, clicks Open, and asserts both
(a) the Compose header shows the loaded name + "· saved" badge
(proves `openedLibraryId` got set), and (b) the corresponding
Library card shows the "open in Compose" badge (proves the binding
is round-trip visible).

Verification: web `npm run typecheck` clean, web `npm test` 69/69
green, full Playwright suite 48/48 green (was 47, added the new
Open-button test).

## 2026-04-19 — PDF export: stack eyebrow above title to fix overlap

User report (with screenshot): the per-board page header in the
exported PDF was rendering "PHASE 1 — BOARD 1" and the board title
("Random 1-200") on top of each other near the top-left corner.

Root cause in `web/src/services/competitionExportPdf.ts`: both
`drawBoardPage` and the per-board section in `drawStatsSummary` placed
the eyebrow and the (much larger 18–20pt) title on the **same baseline**,
just offset horizontally by a fixed 70–90pt. With a multi-phase deck
the eyebrow grows past that offset and collides with the title.

Fix: stack the eyebrow above the title on its own line in both places.
The eyebrow is now drawn at 9pt bold in muted gray as a true label row,
the title sits below it at 18pt (board page) / 12pt (stats summary),
and the horizontal rule moved down to sit under both. The bouts label
on the right now aligns with the eyebrow row, matching the screen
header.

## 2026-04-20 — Compose: pinned-board fill cells now render in ascending order

User report (with screenshot of Board 2): "this should be order correctly".

Boards generated with **no** overrides have always come out sorted
ascending (left-to-right, top-to-bottom) because
`generateRandomBoardLegacy` ends with `[...seen].sort((a, b) => a - b)`.
Boards with **any** pin, however, took the override branch in
`generateBoard()` (`N2K-v3/src/services/generators.ts`), which built
`fillValues` by inserting the random ints into a `Set` and then
splatting them into non-pinned slots in the **iteration order of the
set** — i.e. effectively unsorted. That's what produced the
"69, 517, 443, 214, 661, 697 / 86, 911, 298, …" grid in the
screenshot: the two pins (69 at slot 0, 420 at slot 35) were
positionally correct, but every other cell was scattered.

Fix: in the override branch of `generateBoard`, sort `fillValues`
ascending before merging them into the unpinned slots in row-major
order. Pins still occupy the exact slot the user clicked, and they
may interrupt the monotonic ramp — that's intentional and matches the
"pin = stays where I put it" mental model. With the screenshot's
inputs the same Board 2 now reads `69, 86, 120, 150, 184, 214 /
289, 298, 345, 361, 365, 373 / …` around the two pins, which is what
the user expected.

The doc comment on `generateBoard` was rewritten to spell this out so
nobody re-introduces the unsorted behavior on a future refactor.

Tests: added a focused regression to
`N2K-v3/tests/generators.test.ts` —
`generateBoard with overrides > pins stay at their slots and the
remaining fill cells are sorted ascending` — that pins slots 0 and 35
and asserts the other 34 cells are strictly increasing.

Verification: root `npm run typecheck` clean, root `npm test` 263/263
green; web `npm run typecheck` clean, web `npm test` 69/69 green.

## 2026-04-20 — Match: bout-summary auto-advance bumped 3s → 5s

User report: "3 second auto next is too quick, maybe 5 actual seconds?"

The post-bout summary card (the "Bot took bout 1, 7/14 cells, 50%
efficiency, 23s · Auto-advancing in Ns" screen) was hard-coded to
3000ms in `MatchStore.recordBoutResult()`. That was enough time to see
the winner banner but not enough to read the score line before the
next race kicked off — especially in hot-seat handoffs where the
summary doubles as a "you can look away from the device now" beat.

Fix: hoisted the timing constant to a single named export
`BOUT_SUMMARY_AUTO_ADVANCE_MS = 5000` at the top of `MatchStore.ts`,
threaded it through `scheduleAutoAdvance()`, and imported it into
`MatchView.tsx` so the on-card "Auto-advancing in Ns" label is
derived from the same constant rather than re-hard-coding the number.
Doc comments in both files were updated from 3s → 5s. The explicit
"Next bout →" button still skips the wait immediately.

Verification: `npm run typecheck` clean, `npm test` green
(69/69 unit tests).

## 2026-04-20 — Library: fix Save-as-new dialog never closing (root cause of duplicate Library entries) + persona-name overflow + stale e2e nav rename

User report: "duplicate new competition buttons, pressing save or even
cancel when saving a comp didn't work and I ended up with a million
copies. Ramanujan and other names need slightly lower font sizes."

### 1. Save-as-new dialog stayed open on Cancel/Save (root cause of the duplicate-entries bug)

The dialog was being rendered from two places against two different
state holders:

- `ComposeView` mounted `<SaveAsDialog>` driven by a local React
  `useState<boolean>("showSaveAs")`.
- `LibraryView`'s `DialogHost` mounted `<SaveAsDialog>` driven by
  `LibraryStore.dialog.kind === "save-as"`.

The shared `SaveAsDialog` body (in `library/LibraryView.tsx`) calls
`lib.closeDialog()` on both Cancel and Save. When the dialog was
opened from Compose, `lib.dialog.kind` was already `"none"` (Compose
had never called `lib.openSaveAs`) so `closeDialog()` was a no-op
against the real source of truth — Compose's local `showSaveAs`
boolean. Cancel did nothing. Save persisted the entry, then "did
nothing" — so the user clicked Save again, and again, accumulating a
new Library record on every press.

Fix: Compose now opens the dialog through `lib.openSaveAs(name)` and
mounts the dialog when `lib.dialog.kind === "save-as"`. Single source
of truth — Cancel/Save now actually dismiss it. Belt-and-suspenders:
`SaveAsDialog` keeps a local `saving` flag and ignores re-clicks on
Save while a `createFromSnapshot` Promise is in flight, plus the
backdrop click is suppressed during save and Enter submits.

### 2. PlayPickerDialog: persona names overflowed their grid cells

The bot persona picker uses a `grid-cols-5` layout inside a 480px
modal — each cell is roughly 85px wide. The persona-name span was
rendered with `font-display text-[14px] leading-none`, which was
about right for "Pascal" / "Euler" / "Cantor" but visibly clipped /
broke layout for "Hypatia" (7 chars in display weight) and especially
"Ramanujan" (9 chars). Reduced to `text-[12px] leading-tight
break-words`.

### 3. Stale e2e nav references (incidental)

`docs/roadmap.md` already shows the v3.2 nav as `Lookup · Competition
· Library · Play` (folios I / II / III / IV) but `e2e/smoke.spec.ts`
and `e2e/tabletop-responsive.spec.ts` still pointed at `III Play`. 22
of the 47 e2e tests were failing on this rename alone. Updated the
locators to `IV Play` and added Library to the smoke surface walk.
That brings the responsive sweep + smoke fully green again
(previously: 25/47 passing → now 47/47).

### 4. Pre-existing typecheck regressions cleared

While running `npm run typecheck` to verify the fix, three TS errors
surfaced that pre-dated this session (left over from the v3.2 Library
work landing without a final typecheck pass):

- `services/competitionLibrary.ts` — `summarize()` accessed
  `body.rules` and `b.result` against the V1..V4 union without
  narrowing. TS only narrows discriminated unions on `===` of the
  literal tag, not on `version >= 3`. Cast on the per-branch read.
- `tests/compositionStore.test.ts` — the "spice snaps to nearest
  preset" test built a `SharedPlanV3` envelope by spreading
  `s.snapshot()` (which is V5 with `phases`) into a typed V3 (which
  needs `boards`). Reshaped the V5 snapshot down to a V3 envelope
  (each phase's boards flattened, `bouts` renamed back to `rounds`).

### Tests added

`e2e/library-save-flow.spec.ts` — three new Playwright cases:

1. "Save as new produces exactly one entry per click" — the
   regression test for the duplicate-save bug. Generates the
   defaults, opens Save-as, fills a name, clicks Save once, asserts
   Library has exactly one card with that name.
2. "Cancel in Save-as dialog dismisses without persisting" — guards
   the same root cause from the Cancel path.
3. "PlayPicker persona names fit their grid cells" — measures
   `label.scrollWidth <= tile.clientWidth` for every persona at the
   default viewport so a future style change can't silently
   reintroduce overflow.

All three pass; full unit suite (69/69) green; full e2e suite (47/47)
green. Web typecheck clean.

### Files
- `web/src/features/compose/ComposeView.tsx` — open / read dialog
  state from `lib.dialog`.
- `web/src/features/library/LibraryView.tsx` — `saving` guard,
  Enter-to-save, persona name 14px → 12px.
- `web/src/services/competitionLibrary.ts` — narrow casts.
- `web/tests/compositionStore.test.ts` — V5 → V3 envelope reshape.
- `web/e2e/library-save-flow.spec.ts` — new file.
- `web/e2e/smoke.spec.ts` — `III Play` → `IV Play`, added Library.
- `web/e2e/tabletop-responsive.spec.ts` — `III Play` → `IV Play`.

## 2026-04-19 — v3.2 follow-up: bot rules + Match polish (Phase 4)

Two-part follow-up to the v3.2 ship.

### Bot rules — vs-bot bot now actually plays in Æther matches

Root cause: `MatchStore.startCurrentBout()` was passing
`this.play.setup.rules` (default `"standard"`) into `PlayStore.setSetup`,
which in turn drove `KnockoutBot`'s solver mode. For a comp generated
under Æther rules, the bot's solver swept against the Standard
matrix → zero reachable cells → silent bot, looking like the bot
"wasn't playing".

Fix: `MatchStore` now carries the comp's `rules` (added to
`MatchSnapshot v2`) and forwards it into `PlayStore.setSetup` for
every bout — both vs-bot (so the bot uses the right matrix) and
hot-seat (so equation hints the user reveals are mode-correct). v1
snapshots predating the field fall back to the live comp body's
`rules` on resume.

`MatchView.SideColumn` also gained a live "X/N found · reaches Y"
subtitle on each side so the bot's progress is visible at a glance —
matches the same indicator Quick Race already shows in `BotColumn`.

### Phase 4 polish — Library cards, mode badges, drafts

- **Card thumbnails.** `LibraryEntry` now carries a `firstBoardCells`
  preview (36 numbers) collected from the first generated board. The
  card renders a 6×6 oxblood ramp keyed off normalised cell values
  so a glance at the Library reads the boards' "shape" (pattern
  boards lean monotonic, random boards look speckled). Ungenerated
  comps get a neutral "—" placeholder.
- **Mode badge.** A small Standard / Æther chip sits next to the comp
  name on every card so the user knows what they're walking into
  before hitting Play. The legacy free-text "· Æther" suffix is
  removed in favour of the chip.
- **Draft chip.** The "ungenerated" suffix becomes a subtle
  oxblood-bordered "Draft" chip — same information, less noisy.

### Files touched
- `src/features/match/MatchStore.ts` — schema bump (v1 → v2 snapshot
  with `rules`), `setSetup({ rules })` wired in `startCurrentBout()`.
- `src/features/match/MatchView.tsx` — `SideColumn` subtitle.
- `src/services/competitionLibrary.ts` — `LibraryEntry.firstBoardCells`
  + summarize update for v5 + legacy paths.
- `src/features/library/LibraryView.tsx` — `CardThumbnail`,
  `ModeBadge`, draft chip.
- `tests/competitionLibrary.test.ts` — fixture now seeds a 36-cell
  preview; new assertion that `firstBoardCells` is populated for
  generated comps and empty for drafts.

### Tests
Full suite still 69/69. Typecheck clean. Production build clean.

## 2026-04-19 — v3.2: Library tab + Match play (vs-bot + hot-seat) end-to-end

Single-pass implementation of the v3.2 Library + Match play feature
spec'd in `current_task.md`. Phases 1–3 of the original plan all
landed together; Phase 4 polish (thumbnails, mode badge cosmetics)
deferred to a follow-up.

### New surfaces
- **Library tab** (`features/library/LibraryView.tsx`) — fourth public
  surface, takes folio III. Card grid sorted by last-played by
  default; per-card overflow with Open / Play / Rename / Duplicate /
  View history / Delete. Empty state guides users back to Compose.
- **Match surface** (`features/match/MatchView.tsx`) — takes over the
  Play tab when a competition match is in flight. Indicator strip
  shows `Comp · Phase X · Board Y · Bout N/M [· You as P1]`, with
  Pause + Discard controls. Body is a state machine across racing,
  paused, bout-summary (3s auto-advance), phase-interstitial,
  pass-the-device, and match-end screens.
- **Manage Phases panel** (`features/compose/ManagePhasesPanel.tsx`)
  — modal triggered from the Compose header for phase CRUD
  (add / rename / reorder / duplicate / delete).

### New stores + services
- `LibraryStore` owns saved-comp listing, sort mode, per-comp stats
  roll-ups, and dialog state (play-picker / save-as / rename / history).
- `MatchStore` orchestrates a match end-to-end. Owns its own
  `PlayStore` instance (so Quick Race state stays independent),
  builds a flat schedule of bouts across phases × boards × bouts,
  drives one-by-one play, persists in-flight state to
  `n2k:content:match:current` for reload survival, and writes a
  finished `MatchRecord` to `matchStats` on completion.
- `services/competitionLibrary.ts` is a thin façade over
  `ContentBackend` for browse / save / rename / duplicate / delete of
  named comps.
- `services/matchStats.ts` persists match history per comp under
  `stats:{compId}` and computes the `bestAvgScore` / `lastPlayedAt`
  / `winRate` roll-ups surfaced on the Library card and history
  drawer. Records carry per-bout breakdowns and a `format` tag so
  hot-seat matches stay distinguishable from vs-bot.

### Schema
- `SharedPlanV5` introduces `name: string` + `phases: PhaseConfig[]`
  and renames `BalancedRollsResult.rounds` → `bouts` throughout.
  v1..v4 decoders unchanged; new v4→v5 migrator wraps legacy flat
  board lists as a single phase named "Phase 1" so existing
  autosaves load silently.
- `CompositionStore` was restructured around `phases[]` with a
  `currentPhaseId` cursor; old `boards` getter now returns the
  active phase's boards so `CompetitionResults` and friends keep
  working unchanged. Adds `name`, `openedLibraryId`, and the
  `attachAutosave()` routing that switches the autosave doc id from
  `compose:current` to `compose:saved:{id}` when a Library entry is
  opened in place.

### `PlayStore` extensions
- `pause()` / `resume()` are now first-class actions; the timer
  tracks `pausedAccumMs` so resuming doesn't snap the clock.
- `start()` accepts optional `RaceOverrides` ({ board, playerDice,
  botDice }) so `MatchStore` can inject per-bout state without
  touching the rest of the Quick Race start path.
- New `botDice` observable (alongside existing `dice` for the player)
  + `hasSplitDice` computed; lets hot-seat / vs-bot bouts use
  different dice per side.
- `onFinished` callback + `silentFinish` flag — `MatchStore` wires
  the callback to advance the bout and silences the end-of-race
  chime mid-chain.

### Routing + reload survival
- `View` adds `"library"`. `nav.ts` updated: III = Library,
  IV = Play.
- `App.tsx` introduces `PlayRoute` (renders `MatchView` if a match
  is loaded, else falls back to Quick Race) and a global
  `MatchResumeGate` that detects a saved `match:current` on first
  mount and shows a Resume? / Discard? modal. Resume hydrates the
  `MatchStore`, attaches autosave, routes to Play, and **auto-pauses**
  so the user explicitly confirms before the timer restarts.

### Compose UI
- New `CompositionHeader` with editable competition name + Manage
  Phases / Save as new buttons.
- `PhaseTabs` strip across the editor; clicking a tab swaps the
  active phase. "+" tab adds a new auto-numbered phase.
- `Toolbar` Generate button regenerates every phase × board × bout
  in the comp.
- Export pipeline updated: PDF rolls per-board pages flat as before,
  but each board's eyebrow now carries a `phaseLabel` so a
  multi-phase deck reads "Phase 2 — Board 1" on paper.

### Stats + history UI
- Library card shows last-played time + best-avg-score sourced from
  `MatchStats`.
- History dialog lists every recorded match with format / persona /
  scores / outcome / date; reachable from a Library card's overflow
  menu and from the match-end screen.

### Files touched (high-level)
- New: `features/library/LibraryStore.ts`,
  `features/library/LibraryView.tsx`,
  `features/match/MatchStore.ts`,
  `features/match/MatchView.tsx`,
  `features/compose/ManagePhasesPanel.tsx`,
  `services/competitionLibrary.ts`,
  `services/matchStats.ts`.
- Modified: `stores/PlayStore.ts`, `stores/AppStore.ts`,
  `stores/types.ts`, `features/compose/CompositionStore.ts`,
  `features/compose/ComposeView.tsx`,
  `features/compose/CompetitionResults.tsx`,
  `features/compose/BoardEditor.tsx`,
  `services/competitionExport.ts`,
  `services/competitionExportPdf.ts`, `App.tsx`, `ui/chrome/nav.ts`.

### Tests
- `compositionStore.test.ts` extended for v4→v5 migration, phase CRUD,
  and the autosave-id routing flip when an entry is opened in place.
- New service-level tests for `competitionLibrary` (round-trip
  save/load, rename, duplicate) and `matchStats` (record / load /
  roll-up math). Match-flow integration coverage left for the next
  pass.

## 2026-04-20 — Compose: per-rules board bounds + Æther full-range 3d pool

Two pieces of the Æther parity work the user called out as overdue.
The third (mixed arity 3 / 3+4 / 3+4+5) is now scoped in
`docs/plan-aether-arity-mixes.md` for its own session.

- **Board cells now respect the active rules.** `CompositionStore`
  exposes `cellBounds` driven by `rules`: `{ min: 1, max: 999 }` for
  Standard and `{ min: 1, max: 4999 }` for Æther. `BoardEditor`'s
  `RandomParams` (Min / Max) and `PatternParams` (Start) read those
  bounds for their HTML `min` / `max` attributes, so the spinbuttons
  stop one off the cap of the matrix's `targetRange`. Toggling
  Æther → Standard now clamps every board's `rangeMin` / `rangeMax`
  and any per-cell pin overrides into the standard window (so a 3000
  cell snaps down to 999 instead of leaving the resolver to 404).
  Stored as `RULES_CELL_BOUNDS` for re-use by anything else that needs
  to know the per-mode editor limits.
- **New `aetherFull3d` candidate pool.** `candidatePools.ts` now ships
  a second Æther pool — every unordered triple in
  `AETHER_MODE.diceRange` (`[-10, 32]`, ~14k entries). `aetherSample`
  stays as the default fast-pick (familiar small-positive subrange),
  and the new `aetherFull3d` is the "use the whole matrix you paid
  to load" option. Pool labels were re-edited to reflect what each
  one actually contains: `Æther 3d, positive (size)` /
  `Æther 3d, full range (size)`. The Compose `AetherNotice` paragraph
  was rewritten to mention both pools and the new `[1, 4999]` cell
  cap. Filter rules: full-range pool intentionally skips
  `isLegalDiceTriple` (it's a Standard-set heuristic to suppress
  low-information rolls; Æther users opt in to chaos).

Tests: `tests/candidatePools.test.ts` adds an exhaustive count check
(`C(n+2, 3)` over the full Æther range, plus negative-presence and
upper-face presence sanity); `tests/compositionStore.test.ts` adds
three cases for `cellBounds`, range clamping, and per-cell override
clamping on rules toggle. Full suite: 44 unit tests + 44 Playwright
e2e tests pass.

Files: `web/src/services/candidatePools.ts`,
`web/src/features/compose/CompositionStore.ts`,
`web/src/features/compose/BoardEditor.tsx`,
`web/src/features/compose/ComposeView.tsx`,
`web/tests/candidatePools.test.ts`,
`web/tests/compositionStore.test.ts`.

## 2026-04-20 — Compose: fix "Cannot read properties of undefined (reading 'pair')" crash

User report (screenshot, Compose / Board 1, RANDOM range 1..2003, rounds 4):
the per-board error slot showed `Cannot read properties of undefined
(reading 'pair')`. Root cause traced to `pickBalancedPair` in
`src/services/competition.ts`:

```ts
const sampleSize = Math.max(2, Math.min(candidates.length, Math.ceil(candidates.length / 3)));
const pickIdx = Math.min(Math.floor(rng() * sampleSize), sampleSize - 1);
const picked = candidates[pickIdx]!.pair;
```

The `Math.max(2, …)` floor forced `sampleSize >= 2` even when only one
candidate pair survived the shared-faces filter inside a bucket
(common with small candidate pools or `variance: "varied"`'s strict
zero-overlap rule). `pickIdx` could then land on index `1`,
`candidates[1]` was `undefined`, and the `.pair` access threw. Triggered
roughly half the time per affected bucket — RNG-dependent — which is
why it surfaced intermittently and only on some boards.

### Changes
- `src/services/competition.ts` — swapped the `min`/`max` order so
  `Math.min(candidates.length, …)` is the outer cap, guaranteeing
  `sampleSize <= candidates.length`. Added an inline `NOTE` comment
  preserving the failure-mode context so this isn't reintroduced.
- `tests/competition.test.ts` — added a regression test
  ("does not throw when a stratified bucket yields exactly one valid
  pair") that constructs an 8-tuple pool over 4 rounds (every bucket
  size 2 → exactly one filtered pair) and runs all three variance
  modes across 50 seeds each (150 calls total). Verified it
  reproduces the original `TypeError: Cannot read properties of
  undefined (reading 'pair')` against the pre-fix code, and passes
  cleanly against the fix.

7/7 `tests/competition.test.ts` tests green.

## 2026-04-20 — Section eyebrows, masthead date, edition stamp cleanup

Three small editorial fixes that had drifted out of sync with the v3.1
nav:

- **Section eyebrows now match the nav labels.** Each `PageHeader`
  eyebrow read its own internal name (`Equation Lookup`, `Compose`,
  `Number Knockout — classic race`) which made the chrome inconsistent
  with the tab strip above it. The Compose view also still carried the
  legacy `folio="V"` from the days when the nav had five entries. Now:
  `§ I Lookup`, `§ II Competition`, `§ III Play`. The race-progress
  banner inside Play also reads `§ III · Play · race in progress`.
- **Removed the bogus `1970-01-01` masthead stamp.** The Tabletop
  masthead suffix appended `index.value.generatedAt`, but the loader
  hardcodes that to `new Date(0)` (a placeholder), so every page
  rendered "1970-01-01" next to the edition tag. Dropped the date span
  rather than fake a value — the edition + board number is enough.
- **Edition stamp loses the "Patent Pending / Ages 8+" garnish.** The
  game-box-back stamp in the Tabletop footer used to print
  `PATENT PENDING` and `· Ages 8+`. Renamed `PatentStamp` →
  `EditionStamp` and reduced its body to `<edition> EDITION` /
  `BOARD I`. The matching `tabletop` colophon string in `nav.ts` lost
  the same phrases (`patent pending, ages 8+` →
  `open the box, roll the dice`).

Files: `web/src/features/lookup/LookupView.tsx`,
`web/src/features/compose/ComposeView.tsx`,
`web/src/features/play/PlayView.tsx`,
`web/src/ui/chrome/layouts/BoardLayout.tsx`,
`web/src/ui/chrome/nav.ts`. All 41 unit tests + 44 Playwright e2e tests
still pass.

## 2026-04-20 — Compose: rolls section gets a real tabular grid

The "Rolls per round" surface used to live in a single 7-column `<table>`
that overflowed its container at every viewport below ultra-wide,
falling back to a horizontal scrollbar that looked rough next to the
otherwise paper-stock theme. Replaced with a container-query-driven
dual layout in `CompetitionResults.tsx`:

- **Tabular grid (>= 420px container).** A six-column CSS grid
  (`#`, label, dice, meter, diff, exp) with column headers shown
  once at the top and tabular monospace numbers right-aligned per
  column, so an operator can scan diff/exp balance vertically across
  rounds. Subtle `border-t` row dividers separate rounds without
  breaking column alignment.
- **Stacked cards (< 420px container).** Each round is a card with
  P1 above P2; dice sit on one line and the difficulty pip strip +
  `diff X.XX exp Y.Y` numbers wrap onto a second line as needed. No
  horizontal scrollbar at any width.

The container query lives on the rolls section itself (not the
viewport), so the swap responds to whatever column width the parent
12-col grid hands the rolls — ~410px at `md`, full width on phones,
unconstrained on desktop.

Files: `web/src/features/compose/CompetitionResults.tsx`,
`web/src/styles.css` (added `.rolls-stack` / `.rolls-grid` container
query rules).

## 2026-04-19 — Compose: auto-preview boards (drop Preview button)

Small UX tightening on the Competition (`compose`) tab.

- `web/src/features/compose/BoardEditor.tsx` — removed the per-board
  "Preview" button. The 6×6 cell grid is the preview, so an extra
  click was just friction; the error message that used to sit next to
  the button now renders inline below the rounds field.
- `web/src/features/compose/CompositionStore.ts` — preview cells are
  now generated automatically:
  - on construction for the default boards,
  - on `addBoard`, `updateBoard`, and `setOverride` (replaces the old
    "null the preview, wait for a click" behavior),
  - in `applySnapshot` for restored boards that don't carry an
    embedded `preview` (v1 plans, pre-generation autosaves).
- The store still keeps `previewBoard()` as the primitive — call sites
  just invoke it eagerly now instead of waiting on the user.

## 2026-04-19 — v3.1 docs + headers refresh

Pure documentation pass — no code behavior change. After the dead-code
prune rounds 1+2, several file headers and most of `docs/` still
described surfaces (Compare / Visualize / Explore / Gallery / Studio /
Sandbox / About) and infrastructure (`IdentityStore`, `Resource<T>`,
`v1features/`) that were deleted in the v3.1 trim. Brought everything
in line with the three-tab reality.

### Code header touch-ups

- `web/src/services/aetherSample.ts` — was "used by the Explore view";
  now correctly says "used by the Compose tab as the `aetherSample`
  candidate pool".
- `web/src/features/lookup/AetherLookupView.tsx` — removed dangling
  reference to "the standalone Compare or Visualize tabs for
  cross-tuple browsing".
- `web/src/ui/primitives/FavoriteToggle.tsx` — removed "(e.g. the
  Explore table)" example from the click-propagation note.
- `web/src/styles.css` — `prefers-reduced-motion` block comment no
  longer mentions "Phase 4 / Gallery transitions".
- `web/src/features/compose/ComposeView.tsx` — top-level docstring
  now says "§ II Competition" and clarifies the "compose" / Competition
  internal-vs-public-label split.
- `web/src/features/compose/CompositionStore.ts` — added a top-level
  docstring describing the engine + its service dependencies.
- `web/src/features/lookup/LookupView.tsx` — added a top-level
  docstring covering Standard ↔ Æther dispatch and why
  `AllEquationsList` is standard-only.

### Docs

- `docs/roadmap.md` — fully rewritten. Pre-v3.1 phase entries (Phase 3
  listing `IdentityStore` / `AIService` / `Resource<T>`; Phase 5
  listing the retired surfaces as completed; Phase 6.5 referring to
  `v1features/` and "hidden routes") replaced with a
  "where things stand" snapshot of the three public surfaces, the
  solver workspace, the data pipeline, and the cross-cutting
  infrastructure, followed by a queued-follow-ups list grouped by
  polish / persistence / kernel UX / backend swap / multiplayer /
  future ideas. The earlier phase work survives in a collapsed
  archive section so the v3 history isn't lost.
- `docs/next-features-proposal.md` — fully rewritten. Was scored
  against a hypothetical "10 surfaces" world that no longer exists
  (it referenced Sandbox hot-seat, Studio, Gallery as live
  surfaces). Replaced with a proposal scoped to the actual three-tab
  reality: Done-since-last (Æther rules toggle, spice slider, replay
  UI, responsive sweep, dead-code prunes), Quick wins
  (CompetitionDoc persistence, Lookup share shortcut, error
  reporting), Feature work (IndexedDB, export-replay, custom
  game-mode picker, keyboard Compose, folio source of truth, Æther
  4d/5d parallel scoring, mode-aware DicePicker), Platform
  investments (Firebase auth + Firestore, RemotePlayer + lobby,
  daily challenge), and a speculative tail.
- `docs/architecture.md` — `competitionExport(Pdf|Docx)` corrected
  to `competitionExport(+Pdf)` (the Docx exporter was deleted in an
  earlier pass).

301 (260 solver + 41 web) tests still green. Both workspaces
typecheck clean.

## 2026-04-19 — Competition: per-round variance knob (tight / balanced / varied)

Added a three-level knob controlling how *different* P1's and P2's
rolls feel within a single round. The previous behavior optimized
purely for tiny per-round score gaps, which (a) clustered near-twin
dice triples together and (b) made each round feel like the same
puzzle played twice. The new knob lets the picker deliberately spread
the per-round rolls and trust the existing end-of-card balancer
(`balanceExactly`) to cancel the wobbles in the totals.

Modes:
- **Tight** — score-adjacent pairs (legacy behavior). Per-round gaps
  small, rolls look similar across the table.
- **Balanced** *(new default)* — pairs span ~33% of the bucket. Visibly
  different rolls per round; totals still even out across the card.
- **Varied** — pairs span the full bucket (top quartile × bottom
  quartile). Each round genuinely feels like two different puzzles.
  Tightens the face-overlap requirement to zero shared faces.

In all three modes the existing `MAX_SHARED_FACES_PER_ROUND` filter
still runs (with `varied` requiring zero overlap), so the equation-
leak bug we patched earlier today stays patched.

### Changes
- `src/services/competition.ts` — added the `RoundVariance` type and
  the `variance` option on `BalancedRollsOptions`. `pickBalancedPair`
  now branches on `variance`: tight uses adjacent score pairs, balanced
  and varied pair across low/high slices of the bucket. Picker
  normalizes the returned tuple to `[higherScore, lowerScore]` so
  `generateBalancedRolls`'s P1/P2 alternation prior stays even.
- `tests/competition.test.ts` — added two tests: (1) tight < balanced
  < varied for average per-round score gap, and (2) the whole-card
  residual delta never exceeds the largest single per-round gap (the
  structural guarantee `balanceExactly` provides).
- `web/src/features/compose/CompositionStore.ts` — added
  `VARIANCE_PRESETS`, the `variance` field (default `"balanced"`), the
  `setVariance` action, forwarded the value into
  `generateBalancedRolls`. Bumped the share-plan envelope to v4 so
  `variance` round-trips through autosave and `#plan=…` URLs; older
  v1..v3 permalinks decode as the new default.
- `web/src/features/compose/ComposeView.tsx` — added a fourth
  segmented control labelled "Round variance" next to the existing
  Round spice picker, mirroring its visual treatment.

303 (262 solver + 41 web) tests green. Both workspaces typecheck
clean.

## 2026-04-19 — Competition: prevent dice-overlap leaks between P1 and P2

Closed a gameplay leak in the balanced-roll generator. Pairs like
`9 17 20` vs `3 17 20` (sharing two of three faces) were turning up
regularly because their expected scores naturally cluster, but they
break the basic premise of head-to-head play: P2 listens to every
equation P1 announces, and when both boards share two faces, most of
P1's spoken solutions transfer directly to P2's board.

### Changes
- `src/services/competition.ts` — added `MAX_SHARED_FACES_PER_ROUND`
  (set to `1`) and a `sharedFaceCount` helper. `pickBalancedPair` now
  filters out adjacent score-pairs whose dice share too many faces
  before drawing the round's pair, falling back to the unfiltered set
  only when no compliant pair exists in the bucket (so generation
  never fails for narrow buckets).
- `tests/competition.test.ts` — added a deterministic seeded test
  (`mulberry32`) that exercises the generator across multiple spice
  values and seeds and asserts every round has at most one shared
  face between P1 and P2.

## 2026-04-19 — Competition export consolidated to PDF

Collapsed the post-generate Competition toolbar from three deliverable
actions (Print boards, Export PDF, Export Word) down to a single
`Export PDF` action. The JSON plan export remains as the
machine-readable surface; print + Word are gone from the UI and the
DOCX generator has been retired entirely.

### Changes
- `web/src/features/compose/ComposeView.tsx` — removed `PrintButton`
  and `ExportWordButton` (plus their toolbar slots), dropped the
  `exportToDocx` import, and refreshed the `ExportFileButton` doc
  comment to describe a single PDF generator path.
- `web/src/services/competitionExport.ts` — removed `exportToDocx`
  and the lazy-import of the DOCX generator; reworded the module
  header to reflect a PDF-only deliverable.
- `web/src/services/competitionExportDocx.ts` — deleted; the file was
  the sole consumer of the `docx` package and only existed to back
  the now-removed Word export button.
- `web/package.json` + `web/package-lock.json` — dropped the `docx`
  dependency and its entire transitive subtree.
- `docs/roadmap.md` — updated the Phase 4/5 Compose-export bullets to
  describe the single-format (PDF) deliverable.

## 2026-04-19 — Compose: hide seed from the user

The Compose surface no longer exposes the generation seed. The seed
was always an internal implementation detail (it lets all boards in a
single Generate run share a deterministic RNG stream), but we were
surfacing it as a copyable input field with auto-fill, randomize, and
clipboard affordances — all of which suggested seeds were the way to
reproduce a card. They aren't: shared `#plan=…` permalinks already
embed the resolved board cells and per-round dice rolls verbatim
(`SharedBoardV2.preview` + `result`), so a recipient sees the exact
same card byte-for-byte regardless of seed.

- **`web/src/features/compose/ComposeView.tsx`** — Removed the
  `SeedField` component and its slot in `ConfigPanel`. The Compose
  config grid is now: candidate pool / time budget / spice. No more
  "auto-fills on generate" placeholder, no ↻ button, no clipboard.
- **`web/src/features/compose/CompositionStore.ts`** —
  `generateAll` now unconditionally rolls a fresh seed on every
  press, so each Generate click yields a different card on the same
  boards (previously the same seed reused itself across runs unless
  the user cleared the field). Removed `setSeed`, `randomizeSeed`,
  and `clearSeed` since nothing calls them anymore. The `seed` field
  itself stays on the store and in the `SharedPlanV1/2/3` envelopes
  for back-compat — older permalinks still decode without dropping
  data, and the snapshot still round-trips.
- **`web/tests/compositionStore.test.ts`** — Dropped the
  "seed surfacing (A)" describe block; the underlying methods are
  gone. Snapshot back-compat tests still cover the `seed` field
  carrying through old plan envelopes.

## 2026-04-19 — v3.1 dead-export sweep (round 2)

Second pure cleanup pass over the v3.1 surface, this time focused on
*exports that are declared but no consumer ever touches*. Driven by a
`ts-prune` run, then manually filtered to skip exports that exist only
as a public test contract.

- **`src/games/index.ts`** — Barrel that re-exported every concrete
  game, persona, and bot. No file ever imported from it; `package.json`
  exposes `./core/*` and `./services/*` but not `./games/*`. Deleted.
- **`src/core/constants.ts`** — `ALL_OPERATORS` and `DIFFICULTY_BUCKETS`
  had no callers anywhere (including tests). Removed.
- **`src/core/types.ts`** — `SolverInput` and `SweepInput` interfaces
  were never imported. Removed.
- **`src/cli/parseEquation.ts`** — `operatorSymbol` re-export had no
  callers. Removed (the underlying `OPERATOR_TO_SYMBOL` map is still
  exported from `core/constants.ts` for anyone who wants it).
- **`web/src/services/aetherSolverService.ts`** — `solveAdvanced`
  (single-target façade) had no remaining callers; only `sweepAdvanced`
  is used. Removed the function and the `AetherSweepRow` re-export.
  The worker-side `solve` handler is left intact so the API can come
  back without re-plumbing.
- **`web/src/services/aetherSample.ts`** — `sliceSample` was unused;
  `AETHER_SAMPLE` is consumed directly. Removed.
- **`web/src/services/n2kLoader.ts`** — `tryResolveCell` had no
  callers (the resolver path now goes through
  `competitionService.makeMatrixResolver` + `loadDifficultyMatrixFor`).
  Removed along with its `CellResolution` type.
- **`web/src/services/urlHashState.ts`** — `clearHash` was unused;
  callers pass `null` to `writeHash` to delete a key. Removed.
- **`web/src/services/competitionService.ts`** — `makeDataStoreResolver`
  was unused; `makeMatrixResolver` is the canonical resolver factory.
  Removed.
- **`web/src/features/compose/CompositionStore.ts`** — `BOARD_ROWS`
  re-export had no consumers (`BOARD_COLS` and `BOARD_SIZE` do).
  Removed.
- **`web/src/stores/AppStoreContext.tsx`** — Removed the dead
  `AppStoreContext` re-alias and inlined the previously-internal
  `AppStoreContextInternal` to a single `AppStoreContext` constant.

303 solver tests still green (20 files / 259 tests). 44 web tests
still green (7 files). Both workspaces typecheck clean.

## 2026-04-19 — Tabletop responsive sweep (320px → 2560px)

## 2026-04-20 — v3 lookup print-sheet removal

Removed the dedicated print sheet action from the lookup tab and retired the
single CSS hook that existed only for that button's printable layout.

### Changes
- `web/src/features/lookup/LookupView.tsx` — removed the print-sheet button from the Lookup header.
- `web/src/styles.css` — removed `.lookup-print-sheet` print-specific rule.
- `docs/roadmap.md` — updated lookup polish item from "favorite-toggle + print sheet" to "favorite-toggle only".

Audit pass plus targeted fixes that make the Tabletop edition look and
work correctly at every common viewport from a 320px-wide phone up to
a 2560px ultra-wide desktop. No behavior changes outside layout.

- **PlayView race screen — vertical stacking below `md`.** The dual
  6×6 board layout is now `grid-cols-1 md:grid-cols-2` (was
  `grid-cols-2` always), so phones get one full-width board on top of
  the other instead of two crushed boards side-by-side. Picked `md`
  (768px) as the cutover because at `sm` (640px) each board is still
  too narrow to show 3-digit numbers without crowding.
- **BoardCell font sizing via container queries.** `BoardGrid` now
  declares `containerType: inline-size` and `BoardCell` font-size
  switched from a viewport-based `clamp(14px, 3.6vw, 24px)` to a
  container-based `clamp(11px, 5.5cqw, 22px)`. Cells now scale with
  the actual rendered board width, so 2-up layouts at `md`/`lg` no
  longer collide three-digit cells (104/112/288).
- **DiceStrip wraps on overflow.** The dice strip below each board
  now uses `flex-wrap` with `gap-y-1`, so the auxiliary "Found X/36"
  / "Reaches Y/36" text drops to a second line at ≤320px instead of
  being clipped past the right border.
- **Difficulty tile strip — 3+2 grid below `sm`, 5-up above.** The
  Bot Difficulty selector switched from a fixed `grid-cols-5` to
  `grid-cols-3 sm:grid-cols-5`, and the tile group is a `cqw`
  container so labels (Easy/Standard/Hard/Expert/Master) scale with
  the strip width instead of overrunning a 38px cell at 320px and
  wrapping awkwardly into "Stand-ard"/"Mast-er".
- **PlayView column header + dice strip subtitles always visible.**
  Removed `hidden sm:inline` from the player/bot subtitle (`CLICK TO
  KNOCK` / `TIER 2 · 0/36 FOUND`) and the dice strip's auxiliary
  text. Context now shows on phones, where it matters most.
- **Lookup `NeighborhoodStrip` flexes to fit.** Bars are now
  `flex-1 min-w-[18px] sm:flex-none sm:w-10` with a `gap-[2px]
  sm:gap-1.5` track, so the 11-bar adjacent-targets chart no longer
  forces horizontal scroll on a 320px viewport.
- **Compose rounds table scrolls horizontally on overflow.** Wrapped
  the rolls-per-round `<table>` in `overflow-x-auto -mx-1 px-1` with
  `min-w-[420px]`, so the 7-column structure (#, P1 dice/diff/exp,
  P2 dice/diff/exp) stays usable on phones via in-place horizontal
  scroll instead of breaking the page frame.
- **Tests.** New `web/e2e/tabletop-responsive.spec.ts` runs the four
  surfaces (Lookup, Competition, Play setup, Play race) against ten
  viewports (320, 375, 414, 640, 768, 1024, 1280, 1440, 1920, 2560)
  — 40 cases, all passing — and checks both that the page never
  produces horizontal document overflow and that the key surface
  controls (difficulty tiles, both end-of-board cells) stay visible.
  `smoke.spec.ts` updated to match the v3.1 trimmed nav (just
  Lookup/Competition/Play) and the post-prune masthead. Total: 44
  Playwright cases green.
- **Playwright config.** Added an `N2K_E2E_PORT` override (defaults
  to 5173) so multiple worktrees / running dev servers don't collide,
  and switched the dev-server URL from `127.0.0.1` to `localhost` so
  Playwright correctly detects an IPv6-only existing Vite server and
  reuses it instead of trying to bind a new one.

## 2026-04-19 — v3.1 dead-code prune

Pure cleanup pass — no behavior change, no test changes. After the
v3.1 surface trim landed, several artifacts were left behind that no
longer referenced anything live:

- **Empty feature dirs.** `web/src/features/{about, compare, explore,
  gallery, sandbox, studio, visualize}/` had been emptied during the
  v3.1 prune but the seven directories were never removed. Deleted.
- **`web/src/ui/virtualization/VirtualRows.tsx`.** Hand-rolled
  virtualizer with no remaining importers (the Lookup `AllEquationsList`
  switched to a fixed list ages ago). Deleted along with its parent
  directory.
- **Parallel themes-as-data subtree.** `src/themes/` (loader, registry,
  schema, types, plus 11 `*.theme.json` editions) was a planned
  themes-as-data system that never got wired into the web app — the
  active theme registry has always lived in `web/src/core/themes.ts`
  as typed constants. Only its own tests in `tests/themes/` referenced
  it. Both subtrees deleted.
- **Stale audit docs.** `docs/v2-to-v3-audit.md` and
  `docs/v2-to-v3-ui-diff.md` described the pre-v3.1 codebase
  (`v1features/`, `v1ui/`, the seven retired surfaces). Replaced as
  reference material by the current `architecture.md` + `roadmap.md`.
- **README.md** rewritten — was still describing v2 bootstrap state.
- **architecture.md** rewritten — was claiming `IdentityStore`,
  `CompareStore`, `Resource<T>`, `MemoryContentBackend`, and the
  `themes/editions/` JSON loader, none of which exist in the code.

303 solver tests + 44 web tests still green. Web typecheck clean.

## 2026-04-19 — Compose Æther rules, spice slider, seed surfacing, Play replay

Four next-features land, in priority order from
`docs/next-features-proposal.md`:

1. **G — Æther rules toggle in Compose.** The Æther unlock now drives a
   real first-class rules toggle on the Compose surface, not just an
   editorial notice. `CompositionStore` gained a `rules: "standard" |
   "aether"` field plus a `setRules()` action that swaps the candidate
   pool and invalidates stale results. `competitionService.ts` picked
   up two new exports — `loadDifficultyMatrixFor(mode, …)` (lazy,
   memoized — the `aether-arity3.n2k` blob fetches once per session
   and is shared across Compose, Lookup overlays, and any future
   Æther-mode race) and `makeMatrixResolver(matrix, mode)` (pure
   adapter that depowers only when standard). Æther sample pool now
   keeps the wider `AETHER_MODE.diceRange` (negatives included)
   instead of being filtered down to `[1, 20]`. Snapshot bumped to
   `v3` with back-compat for v1/v2 permalinks.

2. **H — Round-spice slider on the stratifier.** New `spice` knob on
   `BalancedRollsOptions` (algorithm) and a 3-step preset (gentle /
   balanced / spicy) on `CompositionStore`. `spice=0` recovers the
   legacy "easy half only" feel; `spice=1` is the v3.1 shipped
   stratification across the full distribution; mid-points narrow the
   slice proportionally. Plumbed through the snapshot envelope so a
   shared plan carries the spice setting along with everything else.

3. **A — Seed surfacing.** Empty seeds are now auto-stamped with a
   short hex value (`8 hex chars` = 32-bit mulberry32 seed) on
   generate, so any rolls the user likes are always reproducible
   after the fact. The Compose seed input grew a `↻` button (random
   seed + invalidate results) and a `⧉` copy button. The previous
   "type a seed" affordance still works exactly the same way; the
   change is additive.

4. **C — Play replay scrubber.** Post-race results now offer a
   `▶ Replay race` toggle that drops the user into a scrubber UI:
   timeline marks for player + bot knocks, ←/→ to step events,
   Space to play/pause, Esc to exit. Boards re-render at the chosen
   timestamp instead of the final state, and the score line stays
   pinned to the final result so the comparison is still legible.
   `PlayStore` gained `replayMs`/`replayPlaying` observables and
   replay-aware accessors (`currentPlayerKnocked`,
   `currentBotKnocked`, `replayTimeline`); the underlying
   `playerKnocked` / `botKnocked` arrays are immutable — Replay is a
   derived view.

Tests added: `tests/competition.test.ts` (spice stratification + no
duplicate dice), `web/tests/competitionService.test.ts` (mode-aware
depower behavior), `web/tests/compositionStore.test.ts` (rules / spice
/ seed actions + v1 snapshot back-compat), `web/tests/playStore.test.ts`
extended with replay coverage. All 24 solver test files / 303 tests
and 7 web test files / 44 tests pass.

## 2026-04-19 — fixes: standard-mode dice depower in loader, stratified rounds

Two correctness/UX fixes against `v3.1`:

1. **Lookup `[2, 3, 4]` "Couldn't load solutions" bug.** The bake script
   depowers compound dice in standard mode (`4 → 2`, `9 → 3`, etc.) and
   keys the blob chunks by the depowered tuple, so a fresh Lookup query
   for `[2, 3, 4]` was missing in the chunk index (the actual chunk lives
   under `[2, 2, 3]`). `n2kLoader.ts` now applies `depowerDice` per face
   in `canonicalizeDiceTriple` whenever the blob's `modeId === "standard"`,
   so any user-supplied triple resolves to the correct chunk. Æther mode
   still keeps every face value distinct.

2. **Competition resolver missed depowered triples.** Same root cause
   as #1 in a different place: `competitionService.makeDataStoreResolver`
   keyed the difficulty matrix by the raw user-supplied tuple, but the
   matrix is built from the depowered standard chunks. Triples that
   contained 4, 8, 9, or 16 silently resolved to `null` — treated as
   unsolvable and pushed to the hard tier of the picker. The resolver
   now depowers + sorts the dice before keying.

3. **Competition rounds were monotonously mediocre.** The legacy picker
   filtered the candidate pool to "easy half by board difficulty", then
   pulled adjacent pairs by expected score. That collapsed every round
   to the same mid-tier feel — no easy thrash, no hard puzzle, every
   card looked alike. `generateBalancedRolls` in `services/competition.ts`
   now stratifies the playable pool into `rounds` difficulty buckets
   (round 1 = easiest tier, last round = hardest) and within each
   bucket picks the most balanced pair (with light randomness over the
   top-third by score gap) so rounds vary across the difficulty
   distribution while staying fair within. The header doc was rewritten
   to describe the stratification strategy.

## 2026-04-19 — v3.1 prune: three surfaces, `.n2k` dataset, autosave

A consolidation pass that kept only the public surfaces and replaced
the JSON dataset with a binary blob format.

**Surface trim.** Deleted the `v1features/` and `v1ui/` parallel trees
plus all retired surfaces (Explore, Compare, Visualize, Gallery,
Studio, Sandbox, Colophon, Aether sandbox). The web app now ships
exactly three views — Lookup (folio I), Competition (II), Play (III)
— rooted under `web/src/features/`. Nav lives in
`ui/chrome/nav.ts` and renders folios I / II / III.

**Solver alias unification.** `@solver/*` and `@platform/*` both
resolve to `N2K-v3/src/*`. The historical `@platform`-only and
`@solver`-only call sites were kept verbatim so the diff stays
narrow; future imports may pick either.

**`.n2k` binary dataset.** The old JSON dataset
(`index.json`, `dice/*.json`, `by-target.json`, `target-stats.json`,
`difficulty.json`) was replaced by two compact binary blobs in
`web/public/data/`:

- `standard.n2k` — Standard mode, all `DICE_COMBINATIONS` × `[1, 999]`.
- `aether-arity3.n2k` — Æther 3-arity, every Æther 3-tuple
  × `[1, 5000]` (~31 MB; lazily loaded on first Æther query).

Format definition in `src/core/n2kBlob.ts`. Bake script:
`scripts/bake-blob.ts` (run via `npx tsx scripts/bake-blob.ts --mode {standard|aether-arity3}`).
Web-side loader: `web/src/services/n2kLoader.ts` (header parse +
lazy chunk decode). `datasetService` is now a thin facade over the
standard loader. Higher-arity Æther tuples (4d / 5d) intentionally
have no precomputed blob and fall back to `aetherSolverWorker` —
encoding them as bitmaps would have run into hundreds of MB.

**Æther integration across the three surfaces.**

- *Lookup* — `LookupView` checks `secret.aetherActive` and renders
  `AetherLookupView` instead of `StandardLookupView` (full mode swap).
  The standard view's picker bounds are now tied to
  `STANDARD_MODE.diceRange` (no more 1s leaking into the UI).
- *Compose* — Æther exposed as a first-class candidate pool
  (`AETHER_CANDIDATE_POOLS.aetherSample`); the extensive pool was
  retightened to the standard dice range so every emitted triple is
  resolvable against the blob.
- *Play* — added a per-match Standard/Æther rules tile, only
  visible when `secret.aetherActive`. `PlayStore.mode` is now a
  computed derived from `setup.rules` rather than a constant.

**Persistence — `ContentBackend` (#F).** New
`web/src/services/contentBackend.ts` defines the abstract document
interface (`load` / `save` / `remove` / `list`) plus
`LocalStorageContentBackend` and a `defaultContentBackend` singleton.
`CompositionStore.attachAutosave()` mirrors the live snapshot to the
backend on every observable change; `loadFromContentBackend()`
hydrates on mount. Hash-based share links keep precedence — a
`#plan=…` URL beats the local autosave.

**Web tests reseeded.** `web/tests/` previously had nothing; this
pass added focused coverage for the v3.1-critical seams:

- `secretStore.test.ts` — Konami unlock + toggle latch.
- `contentBackend.test.ts` — round-trip persistence.
- `candidatePools.test.ts` — every emitted triple sits inside the
  blob's dice range.
- `lookupStore.test.ts` — clamping + canonical sort.
- `playStore.test.ts` — Æther rules toggle drives mode selection.

Vitest config gained the `@solver` alias alongside `@platform`.

**Docs.** `architecture.md` rewrote the "two stacks coexist" section
to "public surfaces (v3.1)" and added the Modes & Æther integration,
Dataset (`.n2k`), and Persistence sections. This changelog entry.

## 2026-04-19 — KnockoutBot: faithful port of the original `N2K-Game` bot

User report: "the bot doesn't seem to be working like the original."
Audit confirmed three behavioral mismatches between
`src/games/knockoutBot.ts` and `N2K-Game/index.js` (lines 1663–1698,
the live bot loop):

1. **Pacing constant was ~6.5× too fast.** The original gate
   `bot3Cycler * (botSpeed * 0.85 / 10) > currentDiff * 30` at 30 fps
   resolves to `currentDiff * 11_765 / botSpeed` ms per cell. The v3
   port had `BASE_MS_PER_DIFFICULTY = 1800`, which made every tier
   clear cells too quickly.
2. **Hard cells (diff ≥ 12) were being claimed.** In the original,
   diff-12+ cells are *never* claimed — the 1-in-40-per-frame coin
   flip just lets the bot eventually advance past them, costing real
   time (~1333 ms expected) but yielding zero points. The v3 port
   stored hard cells in a `this.hard[]` queue and pulled them on a
   Bernoulli draw inside `tick()`, letting Master grab 1–2 hard cells
   per race the original would never have touched.
3. **Wrong difficulty heuristic for bot decisions.** The bot was
   pacing on v3's published `difficultyOfEquation` (different
   distribution, can score near zero / negative for trivial
   equations), with a `MIN_EFFECTIVE_DIFFICULTY = 1.5` floor patched
   on top to compensate. The original used its own
   `difficultyOfEquation` (lines 1055–1173 of `N2K-Game/index.js`)
   and walked the cell list against *those* values.

Rewrote `src/games/knockoutBot.ts` end-to-end:

- Inlined `botDifficultyOfEquation` as a faithful port of the
  original formula. Includes the original's quirky
  `smallestMultiplier` branch (which always reduces to `-1.2` on the
  first MUL because the variable starts at 0) and the original's
  `Math.round(d * 50) / 100` rounding (which incidentally **halves**
  the value — that's why the cap of 12 and `BASE_MS = 11_765` work
  together; both are calibrated against the halved scale).
- `prepare()` now scores every candidate equation per cell with the
  bot-local heuristic (via `allSolutions(dice, value, mode)`) and
  picks the easiest. Uses `sweepOneTuple` only as a fast
  reachability gate.
- Hard cells (best diff ≥ 12) add the expected hard-skip wait
  (`FRAME_MS / (1/40)` = 1333.3 ms) to the running cumulative clock
  and queue **nothing** — they're unreachable to the bot, exactly
  like the original.
- Dropped `MIN_EFFECTIVE_DIFFICULTY` (no longer needed; the bot
  formula floors at 3.2 internally → 1.6 after halving).
- Dropped the `this.hard[]` claim path from `tick()` entirely.
- `prepare()` now returns the count of *claimable* cells (queue
  length) — the UI's "Reaches X/N" label is now truthful instead of
  inflated by hard cells the bot will never get.

New tests: `tests/games/knockoutBot.test.ts` (11 tests) — pins the
five-tier `BOT_SPEED` table to `[1, 2, 3, 5, 10]`, verifies hard
cells are never claimed even after 10 simulated minutes of Master
play, asserts monotonic clear-counts across tiers, and pins the
expected per-tier cell-clear bands for a 60 s race on the standard
1×8 pattern board.

Touched files:
- `src/games/knockoutBot.ts` — full rewrite, ~340 lines.
- `tests/games/knockoutBot.test.ts` — new, 11 tests.

Tests: full vitest suite (296 tests, was 285) green; web typecheck
clean (`PlayStore` consumes the same public API — `KnockoutBot`,
`BOT_SPEED`, `BotDifficulty` — and didn't need changes).

## 2026-04-19 — Equation render: minimum-PEMDAS parens to disambiguate LTR

Bug report from the user (Æther Lookup, dice [2,3,5,7,11], target 100):
the displayed equation `2^0 + 3^0 × 7^2 + 5^0 + 11^0 = 100` looks wrong
because PEMDAS evaluates it to 52, not 100. Root cause is a
display/grammar mismatch — the N2K solver evaluates expressions
strictly left-to-right with no operator precedence (see
`services/arithmetic.ts:30-32`), but the renderer printed bare tokens
so any reader applying PEMDAS got the wrong answer.

Fix in `web/src/v1ui/Equation.tsx` only — the canonical
`formatEquation` string is unchanged, so CLI output, exports, tests,
and the dataset on disk all stay byte-identical. The renderer now
runs a precedence-paren pass over its tokenized LHS:

  When emitting `expr OP atom`, wrap `expr` in parens iff
    OP is `*` or `/`, AND
    the previous outer op of `expr` was `+` or `-`.

The wrap is "from the very start" — open paren at index 0, close
paren just before the new op. Subsequent `+`/`-` ops never need
additional wrapping because their left operand's outer op is now
`*`/`/`, which already binds tighter under PEMDAS. The result is the
**minimum** number of parens needed for a PEMDAS reading to evaluate
the same as the LTR computation. The user's case now renders as
`(2⁰ + 3⁰) × 7² + 5⁰ + 11⁰ = 100`. The same logic flows through to
the ASCII (Phosphor) variant via a new `tokensToAscii` helper so all
themes stay consistent.

Touched files:
- `web/src/v1ui/Equation.tsx` — added `paren` token kind, tokenizer
  paren-insertion pass, render branch for paren tokens, and
  `tokensToAscii` re-serializer for the ASCII variant.

Tests: full vitest suite (285 tests) green; existing
`tests/parsing.test.ts` cases that pin the canonical no-parens
`formatEquation` output still pass — the change is render-only.

Open follow-up (separate from this fix): `web/src/v1ui/DifficultyBreakdown.tsx`
imports `parseEquation` from `@solver/services/parsing.js`, which
doesn't actually export it (the parser lives in `cli/parseEquation.ts`).
That import is broken at typecheck time. Not addressed here because
DifficultyBreakdown isn't on the user-reported path; flagging for the
next pass.

## 2026-04-19 — Cleanup pass: trim nav, route public surfaces to v3, real Æther in Competition

User context: "we have feature parity, let's clean things up." Three
changes shipped together:

### 1. Public nav trimmed to {Lookup, Competition, Play}

- `v1ui/nav.ts`: split the table into `ALL_NAV_ITEMS` (still the
  source of truth for routing/folio lookups) and `BASE_NAV_ITEMS`
  (the *visible* subset). Only Lookup, Competition (formerly
  Compose), and Play render in sidebars/topbars. Explore, Compare,
  Visualize, Gallery, Studio, Sandbox, Colophon are still routable
  by URL but hidden from the chrome until they're rebuilt on v3.
- "Compose" → "Competition" everywhere a label is rendered (nav
  entry + `features/compose/ComposeView` `PageHeader.title`).
  Internal IDs (`view: "compose"`, `pool: "aether-3d"`, store name,
  feature folder) keep the old slug to preserve URL/shape stability.

### 2. Public surfaces moved off `v1features/` and onto v3 `features/`

- `App.tsx`: switched the routing table for `lookup` and `compose`
  to import from `features/` instead of `v1features/`. Play was
  already on the v3 stack. The v1-ported equivalents are kept
  imported as fallbacks for the (now-hidden) deep-link routes so
  Explore/Compare/Visualize/Gallery/About don't 404 if a user
  navigates manually.
- This is the architectural switchover the v3 docs have been
  promising — the public app is now reading the unified mode
  parameterised solver pipeline (`services/solver.ts` +
  `WorkerSolverDatasetClient`) for everything users see.

### 3. Real Æther mode in Competition (no more 1..20 restriction)

The v1-ported Compose was constrained to dice in [1..20] because it
scored against the bundled standard-mode `difficultyMatrix` JSON.
The new v3 ComposeView uses `LiveCompetitionService`, which calls
`dataset.getChunk(mode, dice)` per candidate — that path goes
through the worker solver and can score *any* tuple in the Æther
universe. So the constraint is gone; the only cost is wall-clock
time per arity.

- `services/competitionService.ts`:
  - Extended `CandidatePool` from 4 → 7 IDs:
    `aether-3d`, `aether-4d`, `aether-5d` join the existing
    `depowered`, `standard`, `extensive`, `aether-sample`.
  - `CandidatePoolMeta` gained `modes: ["standard"|"aether"][]` and
    `arity: 3|4|5` so the UI can filter the dropdown by the active
    mode and the user can't accidentally point a standard-mode
    generator at an Æther pool (or vice-versa).
  - Added `enumerateAetherStratified(mode, arity)` — uses the same
    sparse-stride strategy as v2's `aetherSample.ts`
    (`-10, -5, -1, 1, 2, 3, 5, 7, 11, 13, 17, 23, 32` for arity 3/4;
    a narrower stride for arity 5) so the universe doesn't explode
    (43^5 ≈ 147M tuples without stratification). Cached per arity.
- `stores/ComposeStore.ts`:
  - `setMode()` now auto-picks a sane default pool (`standard` ⇒
    `"standard"`, `aether` ⇒ `"aether-3d"`) so a stale pool doesn't
    survive a mode flip and silently produce empty candidate sets.
  - Added `isAetherPool` / `isStandardPool` predicates, sourced
    from `CANDIDATE_POOL_META`.
- `features/compose/ComposeView.tsx`:
  - `PageHeader.title` → "Competition" (still file-named ComposeView
    to keep imports stable).
  - `GlobalControls` filters `CANDIDATE_POOL_META` by
    `compose.modeId` so the dropdown only shows pools valid for
    the active mode.
  - `AetherNotice` rewritten — no longer warns about the 1..20 cap
    (gone), now explains the time/arity tradeoff for the new pools.

### 4. Stats line follows Æther mode (`useAlmanacIndex` is now mode-aware)

Twelve v1 layouts (Sidebar, Topbar, Spreadsheet, Manuscript, Frame,
Receipt, Board, Platform, Scrapbook, Panels, Chart, Blueprint) all
read `useAlmanacIndex().value.{diceTriplesTotal, recordsWritten,
totalMin, totalMax}` to render the masthead stats strip. Edited the
hook in one place so every layout updates without 12 repetitive PRs:

- `v1stores/useAlmanacIndex.ts`: when `secret.aetherActive`, returns
  a synthesised `DatasetIndex`:
  - `diceTriplesTotal`: 1,711,314 (closed-form sum of unordered
    arity-3/4/5 tuples in [-10..32])
  - `recordsWritten`: same — solved on-demand, no precomputed disk
    catalog
  - `totalMin: 1`, `totalMax: 5000` (the Æther target range)
  - `generatedAt`: carried over from the standard index so
    "Compiled" still shows a meaningful date
- Reactivity flows through the consuming layout's `observer()`
  wrapper, so no observable hook gymnastics needed.

## 2026-04-19 — Æther parity port: v2 features → v3

User asked for the v2 Æther feature set to be brought into v3 the
same way it worked in v2. Discovery: most of the wiring was already
present (the v1 ports under `v1features/` carry the full Æther stack,
and the unified solver in `src/services/solver.ts` already handles
arity 3-5, dice -10..32, and targets 1..5000 by reading off
`AETHER_MODE`). The gaps were (a) the visual + interaction chrome
that surfaces it, and (b) the new `features/` stack having no
SecretStore yet.

### Phase A — Visible wins on the existing v1-ported app

- **`<html data-aether="1">` mirror in `App.tsx`.** The CSS overlay
  block in `styles.css` (cosmic violet vignette, fixed-position Æ
  watermark, SecretBadge halo) was already present but never
  triggered — no useEffect was setting the attribute. Added the
  observer-driven mirror so the moment Konami completes, every
  layout gets the visual signature on top of whatever theme is
  active.
- **Floating SecretBadge in every layout.** The badge was previously
  embedded only in `SidebarLayout`'s footer; on the other 11 layouts
  Æther was unreachable post-unlock. Mounted globally as a
  fixed-position `bottom-3 right-3` element from `App.tsx`. It still
  early-returns null while locked, so public users see nothing.

### Phase B — Æther parity in the new `features/` stack

- **`stores/SecretStore.ts`.** Byte-equivalent port of
  `v1stores/SecretStore.ts` so the new architecture has its own
  unlock/mode latch instead of taking a hard dependency on the v1
  store. Both stacks attach independent listeners to the same
  `window.keydown`, so a single Konami sequence unlocks both.
- **`AppStore.secret` + `App.tsx` attach.** The new SecretStore is
  instantiated in the AppStore constructor (no service-layer
  dependency — it's a pure UI affordance). App.tsx attaches both
  v1 and v2 listeners and lights `data-aether` when *either* stack
  is in Æther mode, so the visual cue tracks the most-recent
  surface.
- **Mode-tab gating.** `features/lookup/ModePicker`,
  `features/explore/ExploreView`'s `ModeSwitch`,
  `features/compose/ComposeView`'s `ModePicker`, and
  `features/compare/CompareView`'s `ManualPicker` now hide the
  Æther option entirely until `secret.unlocked` flips. Public
  surfaces stay standard-only.
- **`features/lookup/ArityPicker`.** New 3 / 4 / 5 selector that
  renders only when the active mode allows multiple arities (i.e.,
  Æther). Picking a new arity calls `LookupStore.setArity`, which
  re-rolls a random legal tuple of that length. Mirrors v2's
  AetherLookupView behavior.
- **`LookupStore.setArity` + `arity` getter.** Validates against
  `mode.arities`; no-op when the requested arity isn't allowed.
  `rollDice` now preserves the current arity instead of always
  resetting to 3, so an Æther user who picked arity 5 keeps it
  across rolls.
- **Per-die ± steppers in `DicePicker`.** Render only in Æther mode
  (where the dice range is wide enough that text-typing -10..32 is
  awkward). Clamps to `mode.diceRange`, skips zero, and surfaces an
  error if the resulting tuple is illegal under the active mode.
- **`AetherNotice` on `ComposeView`.** Mirrors v1's banner: explains
  that Compose's competition generator scores candidates against the
  bundled 1..20 stats dataset, so wider Æther tuples (negatives, &gt;
  20) aren't valid candidates here, and points users at the
  `aether-sample` (-5..20) candidate pool. Hidden in standard mode.

### Notes for the next session

- The v1-ported AetherLookupView / AetherExploreView /
  AetherCompareView / AetherVisualizeView still drive the user-facing
  app today (App.tsx routes through `v1features/`). The new
  `features/` Æther work above is forward-looking — it gives the
  new architecture full parity so the eventual cutover from
  `v1features/` to `features/` doesn't lose Æther.
- No solver changes were required. v3's unified solver already
  supports every arity, dice value, and target range Æther needs.

## 2026-04-20 — Visual fidelity restore + service-aware showcase layouts

Addressed user feedback: "really really laggy and the graphics are
not even close to as good as the original." Two tranches landed in
the same session.

### Performance — main-thread relief

- **Web Worker solver.** `services/workerSolverClient.ts` lazily
  spins up a single shared `solver.worker.ts` and proxies
  `sweepOneTuple`, `allSolutions`, and `easiestSolution` over it. New
  `WorkerSolverService` and `WorkerSolverDatasetClient` plug in via
  `createDefaultAppStore` whenever `globalThis.Worker` is available;
  tests fall back to the inline implementations transparently. Map
  results are flattened to `[k, v]` entry tuples for structured
  cloning.
- **Vertical virtualization.** Hand-rolled `ui/virtualization/VirtualRows.tsx`
  with `requestAnimationFrame`-throttled scroll handling, sticky
  header, and overscan. `LookupView`'s `TargetGrid` and the entire
  `ExploreView` now render only visible rows; both swapped their
  native `<table>` for CSS-grid `div`s so columns stay aligned with
  the sticky header.

### Visual fidelity — port v1 layouts + add 2 new showcases

- **Theme schema extended.** `Theme.style` now carries `layout`,
  `glyph`, `equation`, `ornaments`, and `scale`. `ThemeMeta` gained
  `tagline` and `swatches`. `ThemeRegistry.resolveChain` deep-merges
  `style` through `extends` chains so child themes only declare what
  they want to change.
- **All 10 bundled themes wired.** Every edition now declares its
  layout / glyph / equation / ornaments and a tagline + swatches:
  tabletop→board, almanac→sidebar, blueprint→blueprint,
  manuscript→manuscript, noir→topbar, ember→frame, frost→chart,
  phosphor→spreadsheet, vaporwave→platform, verdant→scrapbook.
- **Layout system.** `ui/layouts/PageShell.tsx` reads the active
  theme's `style.layout` and renders the matching layout from
  `LAYOUTS`. Twelve v1 layouts ported (`board`, `manuscript`,
  `blueprint`, `sidebar`, `topbar`, `scrapbook`, `receipt`,
  `platform`, `panels`, `frame`, `chart`, `spreadsheet`).
- **Two new v2-only showcase layouts:**
  - `studio` — surfaces every `PlatformServices` seam with its bound
    impl name + hint, primed for the "go online" toggle.
  - `sandbox` — game-room HUD with seat slots (1–4 + multiplayer
    placeholder) and a live `Game<Config, State, Move>` kernel
    inspector wired to `PlayStore`.
- **Primitives ported from v1.** `Wordmark`, `Equation` (with
  `<sup>` exponents and Unicode operators), `DiceGlyph`,
  `PageHeader`, `ThemeSelector` (vertical / horizontal / discreet
  popover), `DifficultyMeter`, `FavoriteToggle`. CSS variants for
  every `dice-*` glyph and `equation-display` / `equation-ascii`
  modes live in the global `styles.css`.
- **Feature views adopt the layout.** Every `*View` (Lookup, Explore,
  Compare, Visualize, Compose, Play, Gallery) drops its bare
  `<header>` + outer container in favor of `<PageHeader>` + the
  layout's page surface. Two new surface ids (`studio`, `sandbox`)
  were added to `SurfaceId`, `NAV_ITEMS`, and `App.tsx`'s
  `renderSurface()`. About copy refreshed to reflect 10 editions +
  Studio + Sandbox + worker / virtualization wins.

### Verification

- 285 tests pass (`npm test`).
- `tsc -p web` and `tsc -p tsconfig.json` both clean.
- `vite build` succeeds (worker bundled separately as
  `solver.worker-*.js`).

## 2026-04-19 — Phase 6 starter + depower display polish

Continuing from the post-merge audit. Three quality-of-life fixes
plus the first slice of Phase 6 persistence work.

- **`effectivePool` lifted to `core/`.** N2K Classic's depower-aware
  pool view now lives next to `depowerDice` in `core/constants.ts`,
  so any game built on the kernel inherits the same semantics. `games/n2kClassic.ts`
  imports it instead of redefining its own copy.
- **Equation rendering uses the original rolled dice.** Added
  `formatEquationAgainstPool` / `formatExpressionAgainstPool` (and
  the underlying `relabelDepoweredDice` helper). Standard-mode
  equations from a `[16, 8, 12]` pool now render as `16 - 8 + 12 = 20`
  in the Lookup target grid, the Lookup solutions panel, and the Play
  claim picker — matching what the player sees on the table instead
  of the depowered `[2, 2, 12]` form. Æther mode is a passthrough
  (no compound dice to depower). 7 new parsing tests cover the helper
  + ties-broken-by-largest-compound-first rule.
- **`TargetNeighborhood` selection feedback.** Adjacent-target bars
  now carry an explicit accent-colored outline + bolder label on the
  selected bar plus an `aria-current="true"` for screen readers, so
  arrow-key navigation has unambiguous visual feedback even when
  document focus stays on `<body>`.
- **Phase 6 — Saved boards (BoardDoc).** New `BoardLibraryService`
  (default impl `ContentBackendBoardLibrary`) wraps any
  `ContentBackend` for `kind: "board"` storage; `BoardLibraryStore`
  exposes the list as MobX observables and stays subscribed to the
  backend change feed. `ComposeStore` gained `toLibraryBody`,
  `loadFromLibrary`, and `appendFromLibrary`. The Compose view shows
  a new "Saved boards" panel with Load / Append / Delete and a "★
  Save" button per board editor. Owner isolation is wired through
  `IdentityStore.user.id` — anonymous users get their own per-browser
  bucket today, ready to swap to Firestore later. 9 new web tests
  cover the service + store CRUD, multi-owner isolation, and the
  subscription change feed.
- **`LocalStorageContentBackend`.** Drop-in `ContentBackend` that
  persists to `window.localStorage` (with an in-memory fallback for
  jsdom / SSR). `createDefaultAppStore` now uses it instead of
  `MemoryContentBackend`, so saved boards survive reloads. Wire
  format: per-entity records under `n2k.content.v1.entity.{kind}.{id}`
  + per-kind index under `n2k.content.v1.index.{kind}`. 6 new web
  tests cover round-trip persistence across instances, owner
  filtering, change-feed delivery, and corrupted-index tolerance.

## 2026-04-18 — Games: N2K Classic — time-budget scoring model

**Replaced `score = target − difficulty` with v1's expected-score model applied as live game rules.** Each player has a per-match `timeBudget` (default 60s). Claiming a cell costs `difficultyOfEquation(eq, mode)` seconds from that player's remaining budget — the heuristic doubles as a "seconds to solve" estimate, exactly as the v1 `expectedScore` heuristic does. Claims with difficulty above `hardSkipThreshold` (default 10) are filtered out of `legalMoves`; claims that would exceed remaining budget are rejected by `applyMove`. **Score per player is now simply `Σ board.cells[i]` over the cells they claimed** — the difficulty was already paid in time. Matches now produce realistic 60–150 totals on standard boards instead of near-zero "target minus difficulty" deltas. State carries `remainingBudget: ReadonlyMap<PlayerId, number>` and the wire format includes both the new config fields and the per-player remaining budget (back-compat: pre-budget wires re-initialize each player to the default budget on deserialize). Added exports `DEFAULT_TIME_BUDGET`, `DEFAULT_HARD_SKIP_THRESHOLD`, `effectiveTimeBudget(config)`, `effectiveHardSkip(config)`. Existing tests updated; bots and `replay()` continue to work unchanged because the LocalBot's persona-band filter is strictly tighter than the new hard-skip filter.

## 2026-04-19 — Visualize parity + theme palette expansion

Final batch of v1 → v2 parity work after the share/export/lookup/explore/compose
follow-ups committed earlier this session.

- **VisualizeView — Coverage gaps panel.** New `coverage` computed on
  `VisualizeStore` summarises reachable vs. unreachable target counts,
  surfaces the eight most fragile reachable targets (lowest tuple
  coverage), the eight tuples missing the most targets, and a 20-bin
  histogram of "how many tuples solve each target". Renders below the
  histogram + scatter row with the same `Card` shell as the other
  panels.
- **VisualizeView — Per-tuple sparklines (small multiples).** New
  `tupleProfile(dice)` accessor on `VisualizeStore` lazily fetches a
  tuple's per-target difficulty curve via the wired `DatasetClient`,
  caches it in an observable map, and feeds a `<Sparkline>` SVG
  (target → x, difficulty → y, gaps preserved as broken polylines).
  The `<SmallMultiples>` grid pulls in favorited tuples for the active
  mode plus opt-in "+ 6 easiest" / "+ 6 hardest" chips so users can
  diff curves at a glance without leaving the Visualize surface.
- **`AppStore` wiring.** `VisualizeStore` now receives the dataset
  client alongside `ExploreStore`, keeping the per-tuple fetch in the
  store layer (UI components stay observation-only).
- **Five new bundled theme editions.** Ported `almanac`, `blueprint`,
  `manuscript`, `phosphor`, and `vaporwave` from v1's swatches into
  v2's token shape, all extending `tabletop` so the canonical
  foundation pattern still holds. Bundled count: 5 → 10.
  `tests/themes/editions.test.ts` (≥5 themes, all-extends-tabletop,
  unique ids, summaries + tags) still passes; `web/tests/ThemeStore`
  no longer hard-codes the bundled list — it asserts the canonical
  five are present and the set has unique ids, so future additions
  don't churn the test.

Verification:

- `npx tsc -b` clean in both `v2/` and `v2/web/`.
- `npx vitest run` — 274/274 root tests + 60/60 web tests green
  (`workerPool` concurrency check is timing-flaky on Windows; passes
  on re-run, unrelated to this change).

## 2026-04-19 — Test stabilization on `main`

**All suites green.** 274 root tests + 60 web tests now pass against the
freshly merged `main`. Five surgical fixes:

- `tests/games/n2kClassic.test.ts` — `enumerateClaimEquations`
  "unreachable target" case used dice `[2, 3, 5]` with target `7919`,
  but standard mode actually finds two solutions there. Switched to
  `[2, 2, 2]` (max reachable = 32768; 7919 is genuinely unreachable
  with sums of three powers-of-2). The Æther subset-walking case
  shrank from `[2, 3, 5, 7, 11]` / target `16` (172k results, ~150s)
  to `[2, 3, 5, 7]` / target `12` (2.1k results, ~1s) so the test
  finishes in seconds. The "score sums target − difficulty" case
  read `claimed.get(9)` instead of `claimed.get(CELL_TEN)` (cell 3),
  fixed.
- `tests/games/n2kClassicBots.test.ts` — "passes when every claim is
  above passThreshold" was unsatisfiable because `legalMoves` always
  surfaced a difficulty-0 equation that beat any positive threshold.
  Now hand-feeds the bot a single high-difficulty claim
  (`2^5 + 3^4 + 5 = 118`) so the persona's strict cap actually fires.
- `web/tests/solverWorkerService.test.ts` — "unreachable" target
  cases moved from `[2, 3, 5]` (which can hit `99999`) to `[2, 2, 2]`
  for the same reason as above.
- `web/tests/LookupStore.test.ts` — "setMode replaces dice when
  illegal for the new mode" was constructing the store with
  `initialDice: [3, 4, 5, 6, 7]` and the default `standard` mode,
  which silently rejected the dice and obscured the assertion. Now
  starts with `initialModeId: "aether"` and a `NullDatasetClient`
  stub so the mandatory chunk fetch doesn't block on an arity-5
  Æther sweep through the live solver.
- `web/src/stores/FavoritesStore.ts` — `forMode` was annotated as
  `computed.struct` in `makeObservable`, but it's a regular method
  (takes `modeId` as an argument) so MobX rejected it at construct
  time and broke `AppStore` initialization. Annotation switched to
  `false`; tests pass.

**Verified.** `npm run typecheck` (root), `tsc --noEmit` (web),
`npx vitest run` (root, 274/274), `npx vitest run` (web, 60/60).

## 2026-04-18 — Phase 5: Feature parity with v1

**Six new feature surfaces.** Lookup is no longer the only working tab. The
nav now reads `Lookup · Play · Explore · Compare · Visualize · Compose ·
Gallery · About`, and every tab is functional against the unified core.

**Cross-cutting infrastructure (`web/src/services/`, `web/src/stores/`).**

- `tupleIndexService.ts` (`LiveTupleIndexService`) — enumerates every legal
  dice tuple for a mode, fetches each chunk via the existing
  `DatasetClient`, and computes per-tuple summary stats (solvable count,
  target span, avg/min/max/median difficulty, per-bucket histogram). Caps
  Æther at a configurable sample (default 800) so the live solver doesn't
  block the UI; the cloud-hosted index lands once Phase 1's chunks ship to
  a server. Streams progress via `onProgress` and caches per-modeId.
- `competitionService.ts` (`LiveCompetitionService`) — Monte-Carlo over a
  configurable candidate pool to find balanced two-player rolls per board
  per round, expected score = sum of easiest-known difficulties for cells
  the rolled tuple can hit. Time-budgeted; deterministic with `--seed`.
- `FavoritesStore` — `localStorage`-backed starred-tuple set, keyed by
  `(modeId, sorted dice csv)`.

**Play (`features/play/PlayView.tsx` + `stores/PlayStore.ts`).** Single human
vs. single bot N2K Classic match against the existing game kernel from Plan
B. Setup screen picks mode, persona (`easy`/`standard`/`hard`/`Æther`), and
seat order. Match screen shows the dice pool, scoreboard, 6×6 board with
claimed-cell coloring per player, and a per-cell claim panel that lists the
first 12 enumerated equations from `enumerateClaimEquations`. Bot turns tick
automatically via `LocalBot.pickMove` with the persona's `thinkMs` jitter.

**Explore (`features/explore/ExploreView.tsx` + `stores/ExploreStore.ts`).**
Sortable, filterable table of every legal dice tuple per mode. Filters:
substring query on the printed tuple, favorites-only, min solvable count,
avg-difficulty band. Sorts: dice / solvable / minTarget / maxTarget /
avg/min/max difficulty. Live progress bar while the index warms; partial
data is filterable mid-warmup. Selection drawer shows full per-target stats
+ "send to Lookup" / "send to Compare" actions.

**Compare (`features/compare/CompareView.tsx` + `stores/CompareStore.ts`).**
Up to four bench entries overlaid on a hand-rolled SVG difficulty chart.
Chart modes: per-target / avg-per-bucket / count-per-bucket / cumulative.
Bench restored from `localStorage` across reloads. Manual `mode + dice`
picker plus a favorites picker fed by `FavoritesStore`.

**Visualize (`features/visualize/VisualizeView.tsx` +
`stores/VisualizeStore.ts`).** Three SVG charts driven off the
`ExploreStore` index: an Atlas heatmap of easiest/hardest difficulty per
target with coverage strip, a difficulty-bucket histogram, and a scatter
of `solvable count` vs. `avg difficulty` per tuple. All computeds — no
extra fetches if Explore is already warm.

**Compose (`features/compose/ComposeView.tsx` + `stores/ComposeStore.ts`).**
Multi-board editor (random range or arithmetic pattern, with rounds + per-
cell pinning), competition pool / time-budget / seed controls, and a
generate button that calls `CompetitionService.generate`. Result view
renders per-board / per-round tables and exports the plan as JSON or CSV
(plus a print button — DOCX/PDF wait on themed export styles).

**Gallery (`features/gallery/GalleryView.tsx`).** Every bundled theme
rendered side-by-side in isolated `--theme-*` variable scopes so each tile
shows its real palette + dice/board sample without page-level activation.
Click a tile to make it active everywhere.

**`AppStore` composition.** Now holds `identity / theme / favorites /
lookup / explore / compare / visualize / compose / play`. `PlatformServices`
gains `tupleIndex` and `competition`. `createDefaultAppStore` shares a
single `LiveSolverDatasetClient` across every feature so chunks computed
for Lookup are reused by Compare / Explore / Visualize / Compose.

**Verified.** `tsc -p tsconfig.app.json --noEmit`, `tsc -p
tsconfig.test.json --noEmit`, `tsc -p tsconfig.check.json` (root), and
`vite build` (web) all pass.

## 2026-04-18 — Phase 1: Bulk export pipeline

**Mode-aware bulk export.** `scripts/export.ts` walks every legal dice tuple for a mode, runs `solveForExport` per tuple in a `WorkerPool`, and writes per-tuple JSON chunks + an aggregate bit-packed `.n2k` blob + `manifest.json`. Entry point: `npm run export -- --mode <standard|aether> [--arity 3|4|5|all] [--out <dir>] [--concurrency N] [--no-binary] [--no-json]`.

**Binary format (`src/core/n2kBinary.ts`).** LSB-first `BitWriter`/`BitReader` with zigzag signed varints and unsigned LEB128. Chunk layout: magic `N2KC` + version + modeId(1b) + arity(3b) + reserved(4b) + sorted-dice varints + targetMin/Max/count uvarints + per-record `(permIndex, shared-width exps, 2-bit ops, delta-encoded target, diff×100)`. The per-record `permIndex` resolves into `distinctPermutations(diceTuple)` because the solver returns permuted dice per equation. `encodeChunks`/`decodeChunks` concatenate + stream chunks back.

**Exporter (`src/services/exporter.ts`).** Pure helpers: `canonicalizeTuple` (depower+sort for standard, sort-only for Æther), `exportOneTuple` (runs `solveForExport` over full target range; returns sorted-by-target equations + elapsed ms), `toBinaryChunk` / `toChunkJson` shape converters, `chunkFilename` / `chunkRelativePath` (negatives render as `n10`; Æther nests by arity), `verifyEquation`. `Manifest` / `ManifestChunkEntry` types live here.

**Worker pool (`src/services/workerPool.ts`).** Generic `WorkerPool<TInput, TOutput>` over `node:worker_threads` with a typed `{id, payload}` → `{ok, id, result|error}` envelope. Concurrency, queueing, per-job rejection, worker auto-respawn on crash, `close()` (drain-then-terminate) and `terminate()` (immediate). Defaults to `cpus().length - 1`.

**Worker bootstrap.** `src/services/exporter.worker.bootstrap.mjs` calls `register` from `tsx/esm/api` and then dynamic-imports the `.ts` worker. Node 22 does not reliably propagate `--import tsx` through `execArgv` on Windows, so pointing the `Worker` at a tiny `.mjs` bootstrap avoids that whole class of breakage.

**Tests (46 new).** 22 in `tests/n2kBinary.test.ts`, 14 in `tests/exporter.test.ts`, 10 in `tests/workerPool.test.ts`.

**Wall-clock.** `npm run export -- --mode standard` → 1311 tuples, 518,415 equations, 2.74 MB `.n2k`, **9.64s**. `npm run export -- --mode aether --arity 3` → 14,190 tuples, 5,874,050 equations, 31.8 MB `.n2k`, **53.39s**. Both under the plan's 60s budget.

**Tooling.** `tsconfig.check.json` type-checks `src/`+`scripts/`+`tests/` without disturbing the build's `rootDir: ./src`/`outDir: ./dist`. `npm run typecheck` now runs against that.

## 2026-04-18 — Phase 4 Lookup (on `agent/phase-4-lookup`)

**First real feature surface.** Lookup lets you pick a mode + dice tuple
and see every reachable target, sorted easiest-first, with the easiest
known equation per target. Click a target to drill into every distinct
equation that hits it. Sets the pattern every other feature will follow.

**New services (`web/src/services/`).** Two new pluggable seams, each
with a "live solver" bootstrap impl and a documented upgrade path:

- `datasetClient.ts` — `DatasetClient` interface for fetching the
  per-tuple solution set. `LiveSolverDatasetClient` computes chunks
  on demand via the core solver, dedupes concurrent requests, and
  caches by sorted `(modeId, dice)`. `HttpDatasetClient` arrives once
  PLAN-A's `.json` chunks ship — drop-in swap from `createDefaultAppStore`.
- `solverWorkerService.ts` — `SolverWorkerService` for interactive
  on-demand solves (the dataset covers the cached "easiest known" set;
  this handles "all solutions for this exact total"). `InlineSolverService`
  runs on the current task with a `Promise.resolve()` yield so the UI
  stays responsive. `WorkerSolverService` (Web Worker) lands when
  arity-5 sweeps need it.

**New store (`web/src/stores/LookupStore.ts`).** First feature store.
Owns selection state (mode, dice, optional target) and exposes two
`Resource<T>`s: `chunk` (driven by the dataset client) and
`solutionsForTarget` (driven by the worker service). MobX `reaction`s
re-fetch each resource exactly when its inputs change. Zero `cacheTick`
anywhere — `Resource<T>` already covers the use case.

**Lookup view (`web/src/features/lookup/`).**
`ModePicker`, `DicePicker` (text input + roll button + per-mode
validation), `TargetGrid` (sortable, filterable table with difficulty
tier chips), `SolutionsPanel` (drill-down for a single target). Wired
into `App.tsx` with a tab nav (`Lookup` / `About`). All theming via
CSS variables — works in `tabletop` and `noir` without a re-style.
`difficultyTier.ts` centralizes the bucket → label/color mapping so
the grid and the drill-down agree.

**Shape of every future feature.** This phase establishes the recipe:
`web/src/services/<thing>.ts` (interface + bootstrap impl), `stores/<Thing>Store.ts`
(`Resource<T>`-backed selection state + reactions), `features/<thing>/<Thing>View.tsx`
(observer components only, no logic), wire in `AppStore` + `createDefaultAppStore`,
  add a tab to `App.tsx`. Compose, Visualize, and Play will all follow it.

**Tests.** New suites for `LiveSolverDatasetClient` (caching, dedupe,
order-insensitive keys), `InlineSolverService` (reachability + arity
guards), and `LookupStore` (initial load, mode-switch dice replacement,
target reactivity, sorting invariant, dispose).

## 2026-04-18 — Games: N2K Classic

**First concrete game on the kernel.** `n2kClassicGame` implements `Game<N2KClassicConfig, N2KClassicState, N2KClassicMove>` against the Phase 0 kernel without modifying its interface. Files: `src/games/n2kClassic.ts`, `src/games/n2kClassicSerializer.ts`, `src/games/personas.ts`, `src/games/n2kClassicBots.ts`, `src/games/index.ts`.

**Game rules.** `init` builds a fresh state from `(config, players)`. `legalMoves` returns one `pass` plus every distinct equation (across allowed arities) that uses the dice pool to evaluate to each unclaimed cell — memoized per-target so duplicate values don't re-run the solver. `applyMove` validates equation shape, multiset-subset of dice pool, eval against target, and double-claim before recording the claim and advancing turn round-robin. `isTerminal` fires on board-full / turn-limit / all-passed-this-round.

**Bots.** `LocalBot` consumes a `Persona` (id / displayName / difficultyTarget / mistakeRate / passThreshold / thinkMs), filters claims to its difficulty band, occasionally picks a sub-optimal in-band move (mistake rate), passes when the band is empty. Picks are seeded so multiplayer replays of bot games are deterministic. Stretch: `RandomLegalPlayer` picks uniformly from `legal` for fuzz testing.

**Personas.** Four personas — easy / standard / hard / aether — calibrated against v1's tuning intent. `personasForMode(mode)` gates Æther.

## 2026-04-18 — Phase 2 CLI REPL (`agent/phase-2-cli`)

**CLI surface (`src/cli/`).** Self-contained command-line REPL plus one-shot dispatcher that wraps the Phase 0 services. Both modes route through the same `COMMANDS` table so behavior never diverges.

- `index.ts` — argv router. `n2k` with no args drops into the REPL; `n2k <verb> [args]` runs one command and exits with the command's exit code. Top-level `--help` works, and per-command `--help` (e.g. `n2k solve --help`) prints the usage block.
- `repl.ts` — interactive loop on top of Node `readline`. State (active `Mode`, dice tuple, board) lives in a single `CliContext` mutated across turns. Supports `quit` / `exit` / EOF, blank-line + `#` comment skipping, and quoted multi-word arguments. Built-in `completer` for verb completion.
- `parseArgs.ts` — minimal argv parser (no yargs / commander). Supports `--key value`, `--key=value`, `--flag`, positional args, and `--` end-of-options. Plus typed helpers (`optionalInt`, `optionalIntList`, `flag`, etc.) so commands stay declarative.
- `parseEquation.ts` — CLI-local equation parser (lives here, not in `services/parsing.ts`, because Phase 0 deliberately deferred user-typed input). Whitespace-flexible grammar, parens for negative bases, validates that the parsed equation actually evaluates to the claimed total. Will be replaced when the canonical parser ships in `services/`.
- `render.ts` — pure formatters: `renderEquation`, `renderEquationWithDifficulty`, `renderDifficultyBreakdown` (table), `renderBoard` (6×6 grid), `renderNoSolution`, `renderHeading`. Reuses `services/parsing.ts::formatEquation` for equations.
- `ansi.ts` — 30-line ANSI helper (no `chalk` dep). Every wrapper takes an explicit `enabled` flag, so the CLI passes a single `tty` boolean (`process.stdout.isTTY`) through the codebase and uniformly disables colors when stdout is piped.
- `commands/` — one file per verb (`mode`, `dice`, `roll`, `board`, `solve`, `solve-all`, `sweep`, `explain`, `export`, `help`). Each command implements `(args, ctx, out) => Promise<{ exitCode }>` so it's trivially testable against a fake `Writable`. The `sweep` command writes per-permutation progress lines via `out.write` (not buffered) so piped consumers see incremental output.

**`export` placeholder.** The `export` command prints a "deferred to Phase 1, run `npm run export` directly" message — no imports from PLAN-A's branch files.

**Tests (`tests/cli/`).** 71 new tests across 6 files, all passing:
- `parseArgs.test.ts` — argv parsing (positionals, `--key value`, `--key=value`, boolean flags, `--`, repeats) plus typed helper coverage (15 tests).
- `parseEquation.test.ts` — grammar coverage including exponents, negative bases, whitespace flexibility, and validation that the equation evaluates to the claimed total (13 tests).
- `render.test.ts` — ANSI on/off behavior, `formatEquation` parity, breakdown table shape, board grid layout (8 tests).
- `commands.test.ts` — every command exercised programmatically against a captured `Writable`, including error paths (exit code 1, friendly messages) and state mutation (23 tests).
- `sweep.test.ts` — verifies streaming behavior by counting per-write events during a sweep (2 tests).
- `repl.test.ts` — end-to-end REPL test: feeds a script of inputs into the loop, asserts state persists across turns, blank lines / comments are skipped, EOF exits cleanly, quoted equation arguments tokenize correctly (10 tests).

**Package wiring.** `package.json` adds `"bin": { "n2k": "src/cli/index.ts" }` plus a `"cli": "tsx src/cli/index.ts"` script. `tsconfig.json` already covered `src/cli/**/*.ts` via `src/**/*.ts`. No new dependencies.

**Foundation untouched.** No edits to `src/core/`, `src/services/`, `src/games/`, `src/themes/`, `web/`, `scripts/`, or `fixtures/`. The CLI is a strict consumer of the public services API.

## 2026-04-18 — Phase 3 web foundation (in progress on `agent/phase-3-web`)

**Workspace.** New `web/` workspace: Vite 6 + React 18 + MobX 6 + Tailwind 4 + Vitest 2. Self-contained (`web/package.json`), aliased `@platform/*` → `../src/*` so feature code can import the Phase 0 services directly. Strict TypeScript including `noUncheckedIndexedAccess`. Three project references in `tsconfig.json` (app / node / test) keep build and dev paths fast.

**Pluggable backends (`web/src/services/`).** The three abstractions that the entire feature roadmap depends on:

- `contentBackend.ts` + `local/memoryContentBackend.ts` — `ContentEntity<TBody>` + get / put / delete / list / subscribe / subscribeKind. Memory impl is the bootstrap default; `IdbContentBackend` (IndexedDB) and the eventual Cloud Run / Firestore impl share this contract.
- `identityService.ts` + `local/anonIdentityService.ts` — sync `currentUser()` + async `onChange`. `localStorage`-backed anonymous identity for now; Firebase Auth slots in later behind the same interface.
- `aiService.ts` + `local/stubAIService.ts` — `complete` / `completeStructured` / `stream`. Stub returns deterministic responses for development; the real Gemini call runs through the future Cloud Run proxy so the API key never ships in browser bundles.

**MobX correctness (`web/src/stores/`).** Explicit replacement for v1's `cacheTick` workaround:

- `Resource<T>` — observable `idle / loading / ready / error` state machine over an async fetcher. Reading `state`, `data`, `isReady`, `isLoading` from any observer establishes a real dependency. Built-in supersession (only the latest in-flight fetch commits) and optional debounce.
- `IdentityStore` — mirrors `IdentityService` user changes into MobX.
- `ThemeStore` — registry of `Theme { id, displayName, tokens }` documents. Built-ins: `tabletop` (default) and `noir`. `applyTo(target)` writes `data-theme` + every token as a CSS variable so plain Tailwind utility classes can pick them up. User-authored and Gemini-generated themes register through the same path.
- `AppStore` + `AppStoreContext` + `useAppStore()` — root composition point. Tests inject custom `PlatformServices`; production uses `createDefaultAppStore()`.

**Minimal `App.tsx`.** Boots the store, applies the active theme to `document.documentElement` via `useEffect`, renders an identity card + a theme switcher proving the swap actually works at runtime. Intentionally narrow — it's the proof-of-life for the architecture, not a real surface.

**Tests (`web/tests/`).** 35 tests across 6 files, all passing:
- `MemoryContentBackend` — get / put revision + createdAt preservation, delete idempotence, list filtering & sorting, per-entity and per-kind subscriptions, kind isolation (8 tests)
- `AnonIdentityService` — id stability, persistence, subscription lifecycle (6 tests)
- `StubAIService` — complete / fixedCompletion / stream / structured w/ enum (5 tests)
- `Resource<T>` — every state transition, supersession, debounce, reactivity-without-cacheTick proof (8 tests)
- `ThemeStore` — defaults, switching, registration, `applyTo` correctness (5 tests)
- `AppStore` — composition, default wiring, identity ↔ store sync (3 tests)

**Agent plans landed.** `docs/agent-plans/PLAN-A-bulk-export.md` (Phase 1) and `docs/agent-plans/PLAN-B-n2k-classic-game.md` (first concrete `Game<>` implementation + bots) — fully scoped with file boundaries, branch names, and acceptance criteria so they can be executed by parallel agents without merge collisions.
## 2026-04-18 — Phase 0 foundation

**Workspace.** `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `README.md`. Standalone npm package — no shared deps with v1. `tsc -p .` and `vitest run` are the only build commands.

**Documentation.** `docs/architecture.md` (layered model, single-domain decision, pluggable backend interfaces, game kernel summary), `docs/roadmap.md` (8 phases laid out), `docs/changelog.md` (this file).

**Core (`src/core/`).** Single equation type `NEquation` (3..5 dice, no `Equation`/`NEquation` split). `Mode` interface carries the entire mode preset including dice/target ranges, allowed arities, depower flag, safe-magnitude guard, exponent-cap function, and difficulty weights. `STANDARD_MODE` and `AETHER_MODE` are full presets matching v1 behavior. Operator constants and helpers ported from v1. The bit-packed `n2kBinary` format is deferred to Phase 1 since nothing in Phase 0 needs it.

**Services (`src/services/`).** Six modules:

- `arithmetic.ts` — `applyOperator`, `evaluateLeftToRight` (variadic), `permutations`, `distinctPermutations`, `unorderedSubsets`, `enumerateUnorderedTuples`, `allOpTuples`.
- `solver.ts` — **the unified solver.** `sweepOneTuple` / `easiestSolution` / `allSolutions` / `solveForExport`. One brute-force enumeration handles every arity 3..5 and every dice value via the `Mode` parameter. Replaces v1's `solver.ts` + `advancedSolver.ts` entirely (~600 LoC collapsed to ~300).
- `difficulty.ts` — **the unified heuristic.** `difficultyOfEquation(eq, mode)` and `difficultyBreakdown(eq, mode)` share an implementation. Mode-irrelevant terms collapse out of the breakdown automatically (standard mode emits 7 terms, Æther emits 10). Replaces v1's `difficulty.ts` + `advancedDifficulty.ts`.
- `parsing.ts` — `formatBase`, `formatEquation`, `formatExpression`. Negative bases wrap in parens. The reverse parser is intentionally not implemented yet — every v2 surface either generates equations or reads them from the dataset.
- `generators.ts` — `generateRandomBoard` (mode-aware default range), `generatePatternBoard` (1/2/3 multiples), `generateRandomDice` (mode-aware), `isLegalDiceForMode`. The richer v1 `BoardSpec` / overrides / pin-validation helpers will be ported in Phase 4 alongside the Compose feature.
- `gameKernel.ts` — **the platform forward bet.** `Game<TConfig, TState, TMove>` interface (init / legalMoves / applyMove / isTerminal / score / serialize / deserialize), `Player` interface (`pickMove` returns a Promise so bots, network humans, and AI players are interchangeable), `GameRegistry` for append-only registration, `replay()` helper. No game implementations yet — the contract first, the implementations next.

**Tests (`tests/`).** 49 tests across 5 files, all passing. Coverage includes:
- Arithmetic primitives (12 tests)
- Difficulty heuristic in both modes including the v1 `^0`/`^1` regression and the ten-flag adjustment (10 tests)
- Solver in both modes including auto-arity, depower, sweep progress callback (11 tests)
- Equation formatting (8 tests)
- Board / dice / legality generators (8 tests)

**Behavior parity vs v1.** The unified heuristic is calibrated to match v1's two preset tables exactly, so single-mode rankings stay stable. **Known small drift:** equations with two consecutive `*` operators (e.g. `2 * 3 * 5`) score slightly differently in standard mode vs v1 because the unified formula sums all multiplications instead of v1 standard's "keep last only" semantics. The drift is minor (≤ a few points) and the relative ordering is preserved.

**What is NOT yet ported.** Bulk export pipeline, worker pool, CLI REPL, web frontend, theme registry, content / identity / AI service interfaces, full Compose `BoardSpec`. These are Phases 1+.
