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

## Phase 2 — CLI REPL

- [ ] `src/cli/` — REPL, prompts, output formatting
- [ ] Command set: list / generate / solve / find difficulty / find board difficulty / export
- [ ] No Konami unlock — Æther mode is just `--mode aether`

## Phase 3 — Web foundation

- [ ] `web/` workspace with Vite + React + MobX + Tailwind
- [ ] `services/contentBackend.ts` + `LocalContentBackend` (IndexedDB)
- [ ] `services/identityService.ts` + `AnonIdentityService` (localStorage)
- [ ] `services/aiService.ts` + `StubAIService`
- [ ] `services/datasetClient.ts` — fetches JSON chunks
- [ ] `services/solverWorker.ts` + `solverWorkerService.ts` — pool with `solve` + `sweep`
- [ ] `stores/AppStore`, `DataStore` (with `Resource<T>`), `ContentStore`, `IdentityStore`, `ThemeStore`
- [ ] Theme registry + Tabletop edition as canonical
- [ ] Layout primitives (3-4 of them), starting with the Tabletop layout

## Phase 4 — Feature parity

- [ ] Lookup feature (one store, one view, mode-as-data)
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
