/**
 * Game kernel.
 *
 * The contract every playable surface implements. N2K Classic, future
 * minigames (e.g. "speed solve", "constrained dice"), and any
 * user-defined game module all conform to {@link Game}. Bots, remote
 * humans, and AI players all conform to {@link Player}. Game state is
 * a pure function of `(initialState, moveLog)` — replays and
 * multiplayer fall out for free.
 *
 * Hard rules:
 *   - `applyMove` MUST be pure. No mutation of input state, no I/O.
 *   - `init` MUST be deterministic given its config + a seeded RNG
 *     when the config provides one (so multiplayer can sync state).
 *   - `serialize` / `deserialize` MUST round-trip losslessly.
 *
 * NOTHING in this file imports from `core/constants` or any solver code.
 * The kernel is a generic protocol; specific N2K games live elsewhere
 * (e.g. `src/games/n2kClassic.ts`, registered with a `GameRegistry`).
 */

// ---------------------------------------------------------------------------
//  Identity
// ---------------------------------------------------------------------------

/** Stable per-session player identifier. */
export type PlayerId = string;

/** A seat at the table — a slot waiting to be filled by a {@link Player}. */
export interface PlayerSlot {
  readonly id: PlayerId;
  readonly displayName: string;
  /**
   * Optional faction / colour / personality tag. Surfaces in the UI
   * for theming but has no game-rule meaning.
   */
  readonly tag?: string;
}

// ---------------------------------------------------------------------------
//  Game contract
// ---------------------------------------------------------------------------

/**
 * Canonical game contract. `TConfig` carries the rules variant (board
 * shape, dice pool, time limit, …); `TState` carries everything
 * derivable from the move history; `TMove` is the smallest atomic
 * thing a player does on their turn.
 */
export interface Game<TConfig, TState, TMove> {
  /** Stable identifier; matches the registry key. */
  readonly id: string;
  /** Human-readable label for the lobby UI. */
  readonly label: string;
  /** Short description for the lobby UI. */
  readonly description: string;
  /** Inclusive bounds on player count this game accepts. */
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /**
   * Initial state for a fresh match. Pure: same inputs → same output.
   * If the config requires randomness, it must include a seed and the
   * implementation must use a seeded RNG so all clients agree.
   */
  init(config: TConfig, players: readonly PlayerSlot[]): TState;

  /**
   * Every move `player` may legally make right now. Empty list ⇒
   * player must pass; a no-move pass is itself usually represented
   * as a `TMove` (e.g. `{ kind: "pass" }`) for replay clarity.
   */
  legalMoves(state: TState, player: PlayerId): readonly TMove[];

  /**
   * Pure transition function. MUST NOT mutate `state`; MUST return a
   * fresh `TState`. Throwing here represents a bug, not a refusal —
   * call sites must validate moves against `legalMoves` first.
   */
  applyMove(state: TState, move: TMove, byPlayer: PlayerId): TState;

  /** Whose turn is it? `null` ⇒ no one (game over or simultaneous). */
  currentPlayer(state: TState): PlayerId | null;

  /** Game over predicate. */
  isTerminal(state: TState): boolean;

  /**
   * Final score per player. Called only when `isTerminal` is true.
   * Higher = better; ties are allowed.
   */
  score(state: TState): Record<PlayerId, number>;

  /**
   * Reduce `state` to a JSON-friendly shape for persistence. Must
   * round-trip losslessly with {@link deserialize}.
   */
  serialize(state: TState): unknown;
  deserialize(raw: unknown): TState;
}

// ---------------------------------------------------------------------------
//  Player contract
// ---------------------------------------------------------------------------

/**
 * Anything that can choose a move. Local human, bot persona, remote
 * human (network transport), AI advisor — they all implement the same
 * three methods so the game loop is decoupled from input source.
 *
 * The state and move types are intentionally `unknown` here; concrete
 * games narrow them with their `Game<>` instantiation. A `Player`
 * implementation should be paired with the game it understands.
 */
export interface Player {
  readonly id: PlayerId;
  readonly displayName: string;

  /**
   * Asked to choose one of `legal` given the current state. The
   * implementation may stall on network I/O or model latency — the
   * caller awaits the promise. Throwing is treated as a forfeit.
   */
  pickMove(state: unknown, legal: readonly unknown[]): Promise<unknown>;

  /**
   * Optional lifecycle hook fired once when the player joins a
   * specific game session. Useful for opening a websocket, warming
   * up a model, or sending a "ready" signal.
   */
  onAttach?(sessionId: string): void | Promise<void>;

  /** Optional teardown counterpart to {@link onAttach}. */
  onDetach?(sessionId: string): void | Promise<void>;
}

// ---------------------------------------------------------------------------
//  Registry
// ---------------------------------------------------------------------------

/**
 * Append-only registry of game implementations. The lobby UI iterates
 * `list()` to surface available games; multiplayer rejoin uses
 * `get(id)` to reconstruct a session from a stored game id.
 *
 * Registration is a pure data operation — no module-level side
 * effects. Apps build their own registry instance at boot.
 */
export class GameRegistry {
  private readonly games = new Map<string, Game<unknown, unknown, unknown>>();

  register<TConfig, TState, TMove>(game: Game<TConfig, TState, TMove>): void {
    if (this.games.has(game.id)) {
      throw new Error(`GameRegistry: duplicate game id "${game.id}"`);
    }
    this.games.set(game.id, game as Game<unknown, unknown, unknown>);
  }

  get(id: string): Game<unknown, unknown, unknown> | undefined {
    return this.games.get(id);
  }

  list(): ReadonlyArray<Game<unknown, unknown, unknown>> {
    return [...this.games.values()];
  }
}

// ---------------------------------------------------------------------------
//  Move log — the source of truth for replays and net sync
// ---------------------------------------------------------------------------

/**
 * One entry in a game session's move history. Together with the
 * starting `TConfig`, the move log is sufficient to reconstruct any
 * intermediate state — multiplayer transports send these, replays
 * consume these.
 */
export interface LoggedMove<TMove> {
  readonly move: TMove;
  readonly byPlayer: PlayerId;
  /** Wall-clock millisecond timestamp; useful for replays and pacing. */
  readonly at: number;
}

/**
 * Replay a serialized session by re-running its move log on a fresh
 * initial state. Throws if any logged move is not legal at its turn —
 * which would indicate a kernel implementation bug or transport
 * tampering, not a recoverable condition.
 */
export function replay<TConfig, TState, TMove>(
  game: Game<TConfig, TState, TMove>,
  config: TConfig,
  players: readonly PlayerSlot[],
  log: ReadonlyArray<LoggedMove<TMove>>,
): TState {
  let state = game.init(config, players);
  for (const entry of log) {
    state = game.applyMove(state, entry.move, entry.byPlayer);
  }
  return state;
}
