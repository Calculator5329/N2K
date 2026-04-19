# N2K Platform — Changelog

Running log of what landed each session. Newest first.

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
