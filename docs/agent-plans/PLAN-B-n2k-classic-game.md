# PLAN-B — N2K Classic Game implementation + bots

**Branch:** `agent/games-n2k-classic`
**Estimated scope:** ~500–800 LoC + tests
**Depends on:** Phase 0 foundation (already on `main`) — specifically `src/services/gameKernel.ts`
**Blocks:** Phase 4 web Play feature (the web Play view will instantiate this game and these bots)

## Goal

Implement the first concrete `Game<TConfig, TState, TMove>` against the kernel: **N2K Classic**, the original 6×6-board solo + bot game. Plus a `LocalBot` `Player` implementation and a port of v1's bot personas (Easy / Standard / Hard / Aether). The kernel was deliberately built without any game implementations — this plan delivers the first one.

This is what the future Play view will use; multiplayer in Phase 8 will reuse this same game with a `RemotePlayer` swapped in.

## File boundary

### WILL create

- `src/games/n2kClassic.ts` — implements `Game<N2KClassicConfig, N2KClassicState, N2KClassicMove>`. Concrete types:
  - `N2KClassicConfig`: `{ board: Board; mode: Mode; initialDicePool: readonly number[]; turnLimit?: number; rngSeed?: number }`
  - `N2KClassicState`: `{ board, dicePool, claimed: ReadonlyMap<cellIndex, { byPlayer, equation }>, currentPlayerIdx, turn }`
  - `N2KClassicMove`: `{ kind: "claim"; cellIndex: number; equation: NEquation } | { kind: "pass" }`
  - All game logic (legal moves, score, applyMove) lives here. Pure functions only.
- `src/games/n2kClassicBots.ts` — `LocalBot` `Player` implementation. Takes a `Persona` and a reference to the easiest-solution evaluator. Returns moves via `pickMove`.
- `src/games/personas.ts` — port v1 `web/src/features/play/personas.ts` (do not import from v1 at runtime — copy the data). Each persona declares a `difficultyTarget`, `mistakeRate`, `passThreshold`, etc.
- `src/games/n2kClassicSerializer.ts` — `serialize` / `deserialize` for the state. Verify lossless round-trip in tests. Use plain JSON-friendly objects (no Maps in the serialized form — convert to arrays of `[k, v]`).
- `tests/games/n2kClassic.test.ts` — pure-function tests for `init`, `legalMoves`, `applyMove`, `isTerminal`, `score`. At least 30 tests.
- `tests/games/n2kClassicBots.test.ts` — bot persona behavior: easy bot picks low-difficulty moves, hard bot picks low-difficulty moves more reliably, all bots respect `passThreshold`.
- `tests/games/n2kClassicReplay.test.ts` — `replay()` from `src/services/gameKernel.ts` reconstructs the same state from a logged session.

### MAY modify

- `package.json` — add `"games": "tsx src/games/index.ts"` if creating a CLI entry; otherwise no script changes.
- `src/games/index.ts` (new file) — re-exports the game and bots so consumers can import as `from "n2k-platform/games"` once package exports are wired.
- `docs/changelog.md` — append a "Games: N2K Classic" section.
- `docs/roadmap.md` — check off the Play-game-implementation box (currently nested inside Phase 4).

### MUST NOT touch

- `src/core/`, `src/services/` — foundation is stable. The game implementation IMPORTS from these but does not modify them.
- `web/` — the Play view that uses this game lives in Phase 4.
- The kernel interface (`src/services/gameKernel.ts`) — the kernel was designed to be game-agnostic; this plan is the test of that design. If the kernel needs changes to support a real game, raise it in the PR description as a request, do NOT modify the kernel directly. (We'd rather know now if the kernel needs work.)

## Concrete API contracts

### `src/games/n2kClassic.ts`

```ts
export interface N2KClassicConfig {
  readonly board: Board;
  readonly mode: Mode;
  /** Dice rolled at session start; reused every turn (single-roll variant). */
  readonly initialDicePool: readonly number[];
  /** Optional max turns per player. */
  readonly turnLimit?: number;
  /** Seed for any future per-turn dice re-rolls (multi-roll variants). */
  readonly rngSeed?: number;
}

export interface N2KClassicState {
  readonly config: N2KClassicConfig;
  readonly playerIds: readonly PlayerId[];
  readonly dicePool: readonly number[];
  readonly claimed: ReadonlyMap<number, ClaimedCell>; // cellIndex → claim
  readonly currentPlayerIdx: number;
  readonly turn: number;
}

export interface ClaimedCell {
  readonly byPlayer: PlayerId;
  readonly equation: NEquation;
  readonly difficulty: number;
}

export type N2KClassicMove =
  | { readonly kind: "claim"; readonly cellIndex: number; readonly equation: NEquation }
  | { readonly kind: "pass" };

export const n2kClassicGame: Game<N2KClassicConfig, N2KClassicState, N2KClassicMove>;
```

### Game rules (concrete)

- **Init**: `state = { config, playerIds, dicePool: config.initialDicePool, claimed: new Map(), currentPlayerIdx: 0, turn: 0 }`.
- **legalMoves**:
  - Always includes `{ kind: "pass" }`.
  - For each unclaimed cell `i`, every distinct equation that uses `dicePool` (under `config.mode`) and evaluates to `board.cells[i]` is a `claim` move. Use `allSolutions` from `src/services/solver.ts`.
  - When a `turnLimit` is configured and `turn >= turnLimit`, returns `[]` (forces game over).
- **applyMove**:
  - For `claim`: validate the equation actually solves the cell, record the claim with the `difficulty` from the heuristic, advance `currentPlayerIdx` round-robin, increment `turn`.
  - For `pass`: advance turn but record nothing.
  - Throws on illegal moves (the contract says `legalMoves` is checked first).
- **isTerminal**: `claimed.size === board.cells.length` (board full) OR `turn >= playerIds.length * (turnLimit ?? Infinity)` OR every player passed in their last full round.
- **score**: per-player, sum of `(board.cells[i] - difficulty)` for cells they claimed. Higher = better. (Match v1 scoring; if v1 had different rules, document the variant in the PR.)
- **serialize / deserialize**: convert `claimed: Map` → `Array<[number, ClaimedCell]>`, otherwise pass through. Round-trip must be exact (verified by test).

### `src/games/n2kClassicBots.ts`

```ts
export interface Persona {
  readonly id: string;
  readonly displayName: string;
  /** Bot aims to pick moves whose difficulty is in this range. */
  readonly difficultyTarget: { readonly min: number; readonly max: number };
  /** Probability of picking a sub-optimal move on purpose. */
  readonly mistakeRate: number;
  /** Bot will pass instead of claiming if the only options are above this difficulty. */
  readonly passThreshold: number;
  /** Synthetic latency (ms) added to pickMove to feel more human in the UI. */
  readonly thinkMs: number;
}

export class LocalBot implements Player {
  constructor(persona: Persona, id: PlayerId);
  // pickMove is async — uses persona.thinkMs + a tiny random jitter
}
```

### Personas to port from v1

- `easy` — wide difficulty target, high mistake rate, short think
- `standard` — narrow difficulty target around medium, moderate mistake rate
- `hard` — narrow target around low difficulty, low mistake rate, longer think
- `aether` — only spawns when `config.mode === AETHER_MODE`, picks low-difficulty solutions even at arity 4-5

## Acceptance criteria

- `npm run typecheck` clean.
- `npm test` clean — at least 50 new tests.
- The kernel was not modified. (If you needed to modify it, surface in PR.)
- A "smoke session" test exists that:
  1. Creates a game with the standard mode + a 6×6 random board + dice (2, 3, 5)
  2. Plays 5 turns alternating between two `LocalBot`s with different personas
  3. Asserts the game state is consistent (no double-claims, scores monotonically non-decreasing per claim, etc.)
  4. Serializes the final state, deserializes, and asserts deep equality
- Replay test passes: `replay(n2kClassicGame, config, players, log) deepEqual finalState` from a recorded session.

## Stretch goals

- A `RandomLegalPlayer` implementation that picks uniformly among legal moves (useful for fuzz-testing the game rules).
- A property-based test using fast-check that runs 100 random sessions and asserts: (a) game eventually terminates, (b) score function never throws, (c) final claimed cells is a subset of board cells.

## Hand-off / merge

Open the PR with title `Games: N2K Classic implementation + bots` referencing this plan file. Include in the PR body:
- A short transcript of the smoke-session test output
- Confirmation that the kernel interface was not modified, OR a clear request to modify it with rationale
- A note if any persona behavior diverges from v1
