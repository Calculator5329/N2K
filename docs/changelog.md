# N2K Platform — Changelog

Running log of what landed each session. Newest first.

## 2026-04-18 — Games: N2K Classic — time-budget scoring model

**Replaced `score = target − difficulty` with v1's expected-score model applied as live game rules.** Each player has a per-match `timeBudget` (default 60s). Claiming a cell costs `difficultyOfEquation(eq, mode)` seconds from that player's remaining budget — the heuristic doubles as a "seconds to solve" estimate, exactly as the v1 `expectedScore` heuristic does. Claims with difficulty above `hardSkipThreshold` (default 10) are filtered out of `legalMoves`; claims that would exceed remaining budget are rejected by `applyMove`. **Score per player is now simply `Σ board.cells[i]` over the cells they claimed** — the difficulty was already paid in time. Matches now produce realistic 60–150 totals on standard boards instead of near-zero "target minus difficulty" deltas. State carries `remainingBudget: ReadonlyMap<PlayerId, number>` and the wire format includes both the new config fields and the per-player remaining budget (back-compat: pre-budget wires re-initialize each player to the default budget on deserialize). Added exports `DEFAULT_TIME_BUDGET`, `DEFAULT_HARD_SKIP_THRESHOLD`, `effectiveTimeBudget(config)`, `effectiveHardSkip(config)`. Existing tests updated; bots and `replay()` continue to work unchanged because the LocalBot's persona-band filter is strictly tighter than the new hard-skip filter.

## 2026-04-18 — Games: N2K Classic

**First concrete game on the kernel.** `n2kClassicGame` implements `Game<N2KClassicConfig, N2KClassicState, N2KClassicMove>` against the Phase 0 kernel without modifying its interface. Files: `src/games/n2kClassic.ts`, `src/games/n2kClassicSerializer.ts`, `src/games/personas.ts`, `src/games/n2kClassicBots.ts`, `src/games/index.ts`.

**Game rules.** `init` builds a fresh state from `(config, players)`. `legalMoves` returns one `pass` plus every distinct equation (across allowed arities) that uses the dice pool to evaluate to each unclaimed cell — memoized per-target so duplicate values don't re-run the solver. `applyMove` validates equation shape, multiset-subset of dice pool, eval against target, and double-claim before recording the claim and advancing turn round-robin. `isTerminal` fires on board-full / turn-limit / all-passed-this-round.

**Bots.** `LocalBot` consumes a `Persona` (id / displayName / difficultyTarget / mistakeRate / passThreshold / thinkMs), filters claims to its difficulty band, occasionally picks a sub-optimal in-band move (mistake rate), passes when the band is empty. Picks are seeded so multiplayer replays of bot games are deterministic. Stretch: `RandomLegalPlayer` picks uniformly from `legal` for fuzz testing.

**Personas.** Four personas — easy / standard / hard / aether — calibrated against v1's tuning intent. `personasForMode(mode)` gates Æther.

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
