# Plan — Æther arity mixes in Compose (3 / 3+4 / 3+4+5)

Status: **proposed, awaiting go-ahead**. Author: assistant, 2026-04-20.
Owners: TBD. Related: `docs/architecture.md` "Dataset — `.n2k` binary
format", `docs/changelog.md` 2026-04-20 entries on per-rules board
bounds and the Æther full-range 3d pool.

## What the user asked for

> "Aether board generation should have options between 3 arity, 3
> with some 4 arity, or 3 with some 4 arity and sprinkled in 5 aritys
> as well. Also an option for aether dice which would be -10..32."

The dice-range and 4999 cap are already shipped (see today's
changelog). What's left is the actual mixed-arity generation. The user
explicitly called out that this should be a first-class capability —
not an "on-demand worker" hack — so the plan below pre-bakes the
matrices and refactors the variable-arity types end-to-end.

> "We absolutely want b and it was an oversight to not have the
> codebase support that by default. We want to pre-bake matrices with
> the .n2k file so the app doesn't need to do as much calculation on
> the fly."

## Where the codebase actually is today

These are the load-bearing constraints, all verified against the
current tree.

### Type system locks Compose to arity 3

- `core/types.ts` declares `DiceTriple = readonly [number, number, number]`
  and a separate `AetherTuple = readonly number[]`. Nothing in
  Compose uses `AetherTuple`.
- `services/competition.ts → generateBalancedRolls` and
  `RoundAssignment` are typed against `DiceTriple`. The picker, the
  scorer, the per-round assignment, the share-link encoder — all
  arity-3.
- `web/src/services/competitionService.ts → makeMatrixResolver`
  returns a `DifficultyResolver<DiceTriple>` that calls
  `matrix.lookup(triple, target)` — a fixed 3-key lookup.

### Matrix coverage is arity-3 only

- `web/public/data/aether-arity3.n2k` ships full Æther 3d (every
  triple in [-10, 32] × every target in [1, 5000]) at ~31 MB.
- `bake-blob.ts` already accepts `--arity 4` and `--arity 5` for
  Æther mode (the CLI surface exists), but neither blob has ever been
  baked. The runtime loader (`n2kLoader.ts` /
  `loadDifficultyMatrixFor`) only knows about the 3-arity file name.
- Arity 4/5 tuples are solvable today, but only via the
  `aetherSolverWorker` pool (see `AetherDataStore.sweep`) — which
  takes 1-3 seconds per arity-4 tuple and minutes per arity-5 tuple.
  That's the "fallback chain" architecture documents
  (`docs/architecture.md` lines 170-179), and it's specifically the
  thing the user wants us to stop relying on.

### UI is arity-3 from picker to results

- `BoardEditor` doesn't have an arity selector at all (Compose has
  always assumed 3 dice).
- `RollsGrid` / `RoundPlayerStacked` / `DiceGlyph` render exactly
  three dice per row.
- `CompetitionShareLink` packs `DiceTriple` into the hash; arbitrary
  arity needs a wire format change.

### Sizing reality check

Counts of unordered (i.e. multiset) tuples over the Æther dice range:

| Arity | Unordered tuples | × 5,000 targets | Worst-case blob (rough) |
|------:|-----------------:|----------------:|------------------------:|
|     3 |           14,190 |       70,950,000 |              ~31 MB    |
|     4 |          163,185 |      815,925,000 |              ~360 MB   |
|     5 |        1,533,939 |    7,669,695,000 |              ~3.4 GB   |

A naive "bake everything" arity-5 blob is not shippable to a browser.
We need a curated subset. (See "Phase B" below.)

## Goals, non-goals

**Goals.**
1. Compose can pick "arity 3", "arity 3 + sprinkled 4", or
   "arity 3 + sprinkled 4 + sprinkled 5" as a first-class mode.
2. Each round's chosen tuple resolves against a **pre-baked matrix**
   — no live solver work in the Compose hot path.
3. Variable-arity tuples flow end-to-end: editor → store → resolver →
   results UI → share link → reload.
4. Arity-3 behaviour is byte-identical to today; the new arities are
   strictly additive.

**Non-goals.**
1. Letting users hand-pick arbitrary arity-5 tuples (we ship a
   curated arity-5 subset; out-of-set tuples can still be solved on
   demand by the existing worker, but that's a Lookup-style flow,
   not Compose).
2. Changing how Standard mode works.
3. PDF export changes beyond rendering N dice instead of 3.

## Plan

Three phases, sized for separate sessions.

### Phase A — Variable-arity plumbing (no new matrices yet)

Goal: get `AetherTuple` (or a renamed `DiceMultiset`) flowing through
Compose without breaking arity-3. End state: arity-3 still works
exactly as today, and the Compose data path is shape-agnostic.

1. **Type rename + widen.** Introduce `DiceMultiset = readonly
   number[]` in `core/types.ts` (reusing `AetherTuple` is fine as a
   first step; "tuple" was misleading). Keep `DiceTriple` as a
   convenient alias for legacy call sites.
2. **Resolver.** Generalise `DifficultyResolver<T>` so the
   competition resolver works on any-length multisets. The matrix
   lookup itself (`matrix.lookup(tuple, target)`) is already
   arity-agnostic at the binary layer — only the TypeScript types
   need widening.
3. **Generator.** Refactor `generateBalancedRolls` /
   `RoundAssignment` to carry `DiceMultiset`, not `DiceTriple`. The
   ranker, picker, and assignment logic don't care about arity.
4. **Wire format.** Bump the share-link encoding to a
   length-prefixed format (`{arity, dice[]}`) so reloading a
   v3.2-share-link still works while v3.3+ carries 4d / 5d rounds.
   Old links read as arity-3 by default.
5. **UI shape changes.** `RollsGrid` / `RoundPlayerStacked` render
   `tuple.length` dice slots. `DiceGlyph` already only knows about
   one die.
6. **Tests.** Add a parameterised `competitionStore` test that drives
   the same scenario at arities 3, 4, 5 (using a fake resolver) and
   confirms balancing math is unchanged at arity 3. No matrix
   changes in this phase — arity-4 / 5 candidate pools stay empty
   and the UI greys those options out.

Deliverable: PR titled "Compose: variable-arity plumbing". Pure
refactor, zero behaviour change.

### Phase B — Bake the matrices

Goal: ship `aether-arity4-curated.n2k` and
`aether-arity5-curated.n2k` blobs, lazily loaded the first time a
Compose plan needs them.

1. **Curate the dice subsets.** Picking what to bake is the load-
   bearing decision. Sketch:
   - **Arity 4 subset (target ~5,000 tuples ≈ 11 MB):**
     - Every arity-4 multiset over the "small positive" Æther
       sub-range `[2, 16]`: C(15+3, 4) = 3,060 tuples.
     - Plus every multiset that contains at least one negative die
       in `[-10, -1]` and three positive dice in `[2, 12]`: ~2,000
       extra. (Knob.)
     - Total: ~5,000 tuples × 5,000 targets at the same bit-width as
       arity 3 → ~11 MB blob (linear in tuple count).
   - **Arity 5 subset (target ~2,000 tuples ≈ 4-5 MB):**
     - Every arity-5 multiset with all dice in `[2, 8]`:
       C(7+4, 5) = 462 tuples.
     - Plus the curated "interesting" set: any 5-tuple where exactly
       one die is in `[-5, -1]` or in `[20, 32]` and the others are
       in `[2, 12]`.
     - Total: ~2,000 tuples → ~5 MB blob.
   - These caps are negotiable. The hard constraint is total
     download (target: keep the combined Æther payload under
     ~50 MB so Æther unlock stays a "one-time slow load, then
     instant" experience). The numbers above hit ~47 MB total with
     the existing arity-3 blob.
2. **Bake script.** Add a `--subset <id>` flag to `bake-blob.ts` that
   dispatches to a named tuple-enumerator, then writes
   `aether-arity4-<subset>.n2k` instead of the today's
   `aether-arity4.n2k`. The `<subset>` lands in the blob header so
   the runtime can refuse a mismatched file.
3. **Time the bake.** Spot-check: a single arity-4 sweep at
   target=`[1, 5000]` runs in ~1-3s on the worker pool. 5,000 tuples
   ≈ 90 minutes wall-clock at full concurrency. Arity-5 at ~30s per
   tuple × 2,000 tuples ≈ 16 hours. Both are one-off offline jobs;
   plan to bake on a workstation overnight.
4. **Runtime loader.** Extend `n2kLoader.ts` so
   `loadDifficultyMatrixFor("aether", arity)` resolves to the right
   blob. Update the `defaultDataset` plumbing so each arity has its
   own cache slot. `competitionService.ts` already has the
   `makeMatrixResolver` seam — wire each arity's resolver through it.
5. **Candidate pools.** Add `aetherCurated4d` and `aetherCurated5d`
   pools to `candidatePools.ts`, mirroring the bake subset exactly
   (same tuple enumerator, single source of truth — `core/`
   constants for the subset bounds).
6. **Pool guarantee.** The generator must only pick tuples that have
   matrix coverage. Phase B adds an invariant: a candidate pool's
   tuples are a subset of the matrix it's resolved against. A
   runtime assertion in the resolver catches any drift.

Deliverable: PR "Æther arity-4/5 pre-baked matrices + loader". Ships
the two blobs, the loader changes, and the new pool registrations.
No UI changes yet beyond the new pool entries appearing in the
existing pool picker.

### Phase C — Mixed-arity Compose modes

Goal: the user-facing feature. Pick "3", "3+4", or "3+4+5" in the
Æther rules tile and have the per-round dice arity vary.

1. **Mode tiles.** Add three Æther arity-mix presets to the rules
   row:
   - `Æther 3d` — all rounds arity 3 (today's behaviour, default).
   - `Æther 3d + sprinkled 4d` — ~70% arity 3, ~30% arity 4.
   - `Æther 3d + sprinkled 4d + 5d` — ~60% arity 3, ~30% arity 4,
     ~10% arity 5.
   The exact ratios are tunable; a knob in `CompositionStore`
   (`arityMix: { 3: number; 4?: number; 5?: number }`) controls
   round assignment.
2. **Per-round dispatch.** `generateBalancedRolls` already iterates
   rounds. For each round, it now picks an arity from the mix's
   probability distribution (deterministic, seeded by the existing
   round seed), then draws from that arity's candidate pool.
3. **Per-round resolver routing.** Each round resolves against the
   matrix that matches its arity. Cached resolvers per arity, so the
   matrix files load lazily on first use.
4. **Per-round difficulty parity.** The score-balancing math
   (expected score, total difficulty) is already arity-agnostic, but
   we should confirm that the difficulty scale across arities is
   comparable (a "difficulty 50" arity-4 round should feel like a
   "difficulty 50" arity-3 round). If not, we add a per-arity
   normalisation factor next to the existing tier curves.
5. **UI breadth.** Rounds table + share link + autosave already
   carry arity from Phase A.
6. **Æther unlock copy.** Update `AetherNotice` and the rules tile
   subtitle to mention "mixed arity rounds, pre-baked matrices,
   ~50 MB lazy load".

Deliverable: PR "Compose: mixed-arity Æther rounds". Wires the
preset row, the per-round dispatch, the routed resolvers.

## Tests

- Unit: `compositionStore.test.ts` — arity-mix probability
  distributions sum to 1 (per-round selection), arity-3 default
  still produces deterministic results.
- Unit: `competition.test.ts` (root workspace) — score balancing on a
  fake resolver at mixed arities; result symmetry.
- Unit: `n2kLoader.test.ts` — arity-4 / arity-5 file headers parse
  correctly; subset-tag mismatch raises.
- E2E: a new `tabletop-aether-mixed-arity.spec.ts` that unlocks
  Æther, picks each arity-mix preset, generates a competition,
  asserts that rounds carry the expected arities and that the share
  link round-trips.

## Risks, open questions

1. **Bake time for arity 5.** ~16 hours offline is fine for us; not
   fine for a regular CI run. Decision: keep the bake offline, ship
   the blobs in the repo (they're a one-time artefact), guard CI
   against ever re-baking on its own.
2. **Difficulty scale normalisation across arities.** Need a small
   exploratory script to confirm the existing difficulty curves are
   apples-to-apples. If not, add per-arity tier remapping in
   `tierCurves.ts`. (Catch this in Phase C, not B.)
3. **Subset choice.** The arity-4 / arity-5 subsets above are a
   first guess. Worth a pre-Phase-B sanity check with the user:
   "are these the right windows of dice to cover, or do you have a
   different mental model of what 'sprinkled 4d/5d' should look
   like?"
4. **Total download budget.** Today: standard.n2k (1 MB) +
   aether-arity3.n2k (31 MB) on Æther unlock. After Phase B:
   +~16 MB. Verify on a slow connection that the lazy-load story
   still feels fine; consider compressing further or splitting the
   arity-4 / 5 blobs into per-arity downloads triggered by which
   mix the user picked.
5. **Worker pool obsolescence.** Phase B doesn't delete
   `aetherSolverWorker` — Lookup still uses it for arbitrary
   user-typed tuples. Compose just stops calling into it. Worth a
   follow-up note in the architecture doc once Phase C lands.

## Estimated effort

- Phase A — 1 focused session (4-6 hours of work).
- Phase B — 1 session for code (4-5 hours) + offline bake time
  (~24 hours wall clock).
- Phase C — 1 session (3-4 hours).
- Total: ~2 weeks calendar time, ~3 working sessions.

## Decision checkpoints (please confirm before we start)

1. Are the arity-4 / arity-5 subset definitions in Phase B § 1
   directionally right?
2. Is a ~50 MB total Æther download acceptable, or do we need to
   split arity-4 / 5 into separate lazy-load chunks (only fetched if
   the user picks a mix that uses them)?
3. Is the variable-arity refactor (Phase A) OK to land on its own as
   a pure refactor PR before any new matrices ship?
