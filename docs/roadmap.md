# N2K Platform — Roadmap

## Phase 0 — Foundation ✅

- [x] Workspace scaffolding (`package.json`, `tsconfig`, `vitest`, `.gitignore`, README)
- [x] `docs/architecture.md`
- [x] `src/core/types.ts` — `NEquation`, `Mode`, `DifficultyWeights`, `Operator`, `Arity`, `Loadable<T>`, `Board`
- [x] `src/core/constants.ts` — `STANDARD_MODE`, `AETHER_MODE`, `OP`, `STANDARD_DIFFICULTY`, `AETHER_DIFFICULTY`, exponent caps, `depowerDice`
- [x] `src/core/n2kBinary.ts` — bit-packed binary format (landed with Phase 1)
- [x] `src/services/arithmetic.ts`
- [x] `src/services/solver.ts` — unified `sweepOneTuple` / `easiestSolution` / `allSolutions` / `solveForExport`
- [x] `src/services/difficulty.ts` — unified `difficultyOfEquation` / `difficultyBreakdown`
- [x] `src/services/parsing.ts` — formatter only (parser deferred until user-typed input lands)
- [x] `src/services/generators.ts` — random/pattern boards + mode-aware dice + legality (BoardSpec deferred to Phase 4)
- [x] `src/services/gameKernel.ts` — `Game<>` + `Player` + `GameRegistry` + `replay()`
- [x] vitest suite — 49 tests passing

## Phase 1 — Bulk export pipeline ✅

- [x] `src/services/exporter.ts` — single mode-aware exporter
- [x] `scripts/export.ts` — CLI that takes `--mode standard|aether`
- [x] Worker-pool (`worker_threads`) for parallel sweep
- [x] `.n2k` binary chunks + index + coverage
- [x] JSON-chunk projection for the web app

## Phase 2 — CLI REPL ✅

- [x] `src/cli/` — REPL, prompts, output formatting
- [x] Command set: mode / dice / roll / board / solve / solve-all / sweep / explain / export / help / quit
- [x] No Konami unlock — Æther mode is just `--mode aether`

## Phase 3 — Web foundation ✅

- [x] `web/` workspace with Vite 6 + React 18 + MobX 6 + Tailwind 4 + Vitest 2
- [x] `services/contentBackend.ts` interface + `MemoryContentBackend` (bootstrap default)
- [x] `services/identityService.ts` + `AnonIdentityService` (localStorage)
- [x] `services/aiService.ts` + `StubAIService` (deterministic stub for dev)
- [x] `stores/Resource<T>` — explicit replacement for v1's `cacheTick`
- [x] `stores/AppStore`, `IdentityStore`, `ThemeStore` (built-ins: tabletop + noir)
- [x] React entry + minimal `App.tsx` proving the wiring (theme switcher, identity card)
- [x] `services/datasetClient.ts` — `DatasetClient` interface + `LiveSolverDatasetClient` bootstrap
- [x] `services/solverWorkerService.ts` — `InlineSolverService` bootstrap
- [ ] `services/local/idbContentBackend.ts` — IndexedDB persistence
- [ ] `HttpDatasetClient` consuming Phase 1 JSON chunks
- [ ] Web Worker `SolverWorkerService` impl
- [ ] Theme registry hydrates from `ContentBackend` (built-ins seeded on first launch)
- [ ] Layout primitives (3-4 of them), starting with the Tabletop layout

## Phase 4 — Feature parity

- [x] **Lookup feature** — `LookupStore` + `LookupView` (mode/dice/target pickers + sortable target grid + per-target drill-down); `DatasetClient` (`LiveSolverDatasetClient` bootstrap; `HttpDatasetClient` after PLAN-A); `SolverWorkerService` (`InlineSolverService`; Web Worker impl when warranted)
- [ ] Compose feature (board editor + competition generator + DOCX/PDF export)
- [~] Play feature (single-player + bot, on the game kernel) — game/bot foundation landed (`src/games/n2kClassic*`); web UI pending
- [ ] Information / About

## Phase 5 — Hidden features (future admin gate)

- [ ] Explore (sortable index of dice tuples)
- [ ] Compare (up to 4 tuples, chart projections)
- [ ] Visualize (heatmap + scatter + histogram)
- [ ] Gallery (theme showcase across all editions)

## Phase 6 — Platform extensions

- [ ] Persisted boards as `BoardDoc` content entities
- [ ] Persisted competitions as `CompetitionDoc`
- [ ] Persisted custom themes as `ThemeDoc`
- [ ] Game replay UI (read game log, scrub move-by-move)
- [ ] AI-generated theme prompt + validation

## Phase 7 — Backend swap (when ready)

- [ ] `FirestoreContentBackend` drops in
- [ ] `FirebaseIdentityService` drops in
- [ ] Cloud Run TS backend hosting the `GeminiAIService` (so API key never ships)
- [ ] Hoist `src/core` and `src/services` into `packages/n2k-core` if not already

## Phase 8 — Multiplayer

- [ ] `RemotePlayer` impl reading moves from a Firestore subscription
- [ ] Game session as a content entity
- [ ] Lobby / matchmaking UI
- [ ] Replay / spectator mode (free with the kernel design)

## Future (track in this doc as ideas land)

- Daily challenge with global leaderboard
- Tournaments / brackets / seasons
- Custom dice / operators / rule modules
- Puzzle / campaign mode
- AI commentary, hint system, NL solve
- Classroom mode for teachers
- N2K minigames (each implements `Game<>`)
- PWA / offline / mobile native
