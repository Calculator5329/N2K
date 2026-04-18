# N2K Platform — Changelog

Running log of what landed each session. Newest first.

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
