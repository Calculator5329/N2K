# N2K Platform — Changelog

Running log of what landed each session. Newest first.

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
