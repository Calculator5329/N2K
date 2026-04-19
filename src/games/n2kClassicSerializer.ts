/**
 * Serialization for {@link N2KClassicState}.
 *
 * Encodes the state as a plain JSON-friendly object:
 *   - `Map`s become `Array<[key, value]>`
 *   - The `Mode` reference inside `config` becomes `{ id }` and is
 *     restored by lookup in `BUILT_IN_MODES`. (User-defined modes
 *     will need a content-layer rehydrator — see `core/types.ts`.)
 *   - Everything else is structurally serializable already.
 *
 * Round-trip is verified by `tests/games/n2kClassic.test.ts`.
 */
import { BUILT_IN_MODES } from "../core/constants.js";
import type { Board, Mode, NEquation, Operator } from "../core/types.js";
import type { PlayerId } from "../services/gameKernel.js";
import type {
  ClaimedCell,
  N2KClassicConfig,
  N2KClassicState,
} from "./n2kClassic.js";

// ---------------------------------------------------------------------------
//  Wire shape
// ---------------------------------------------------------------------------

interface SerializedConfig {
  readonly board: Board;
  readonly modeId: "standard" | "aether";
  readonly initialDicePool: readonly number[];
  readonly turnLimit?: number;
  readonly rngSeed?: number;
}

interface SerializedClaim {
  readonly byPlayer: PlayerId;
  readonly equation: NEquation;
  readonly difficulty: number;
}

export interface SerializedN2KClassicState {
  readonly v: 1;
  readonly config: SerializedConfig;
  readonly playerIds: readonly PlayerId[];
  readonly dicePool: readonly number[];
  readonly claimed: ReadonlyArray<readonly [number, SerializedClaim]>;
  readonly currentPlayerIdx: number;
  readonly turn: number;
  readonly consecutivePasses: ReadonlyArray<readonly [PlayerId, number]>;
}

// ---------------------------------------------------------------------------
//  Mode handling
// ---------------------------------------------------------------------------

function modeIdToWire(mode: Mode): "standard" | "aether" {
  if (mode.id === "standard") return "standard";
  if (mode.id === "aether") return "aether";
  throw new Error(
    `n2kClassicSerializer: cannot serialize custom mode "${mode.id}" (only built-in modes are wire-stable)`,
  );
}

function wireToMode(id: "standard" | "aether"): Mode {
  const mode = BUILT_IN_MODES[id];
  if (mode === undefined) {
    throw new Error(`n2kClassicSerializer: unknown mode id "${String(id)}"`);
  }
  return mode;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function serializeState(
  state: N2KClassicState,
): SerializedN2KClassicState {
  const claimed: Array<readonly [number, SerializedClaim]> = [];
  for (const [cellIndex, claim] of state.claimed) {
    claimed.push([
      cellIndex,
      {
        byPlayer: claim.byPlayer,
        equation: claim.equation,
        difficulty: claim.difficulty,
      },
    ]);
  }
  // Sort by cellIndex so the serialized form is stable across runs.
  claimed.sort(([a], [b]) => a - b);

  const passes: Array<readonly [PlayerId, number]> = [];
  for (const id of state.playerIds) {
    passes.push([id, state.consecutivePasses.get(id) ?? 0]);
  }

  const wireConfig: SerializedConfig = {
    board: state.config.board,
    modeId: modeIdToWire(state.config.mode),
    initialDicePool: state.config.initialDicePool,
    ...(state.config.turnLimit !== undefined ? { turnLimit: state.config.turnLimit } : {}),
    ...(state.config.rngSeed !== undefined ? { rngSeed: state.config.rngSeed } : {}),
  };

  return {
    v: 1,
    config: wireConfig,
    playerIds: state.playerIds,
    dicePool: state.dicePool,
    claimed,
    currentPlayerIdx: state.currentPlayerIdx,
    turn: state.turn,
    consecutivePasses: passes,
  };
}

export function deserializeState(raw: unknown): N2KClassicState {
  if (raw === null || typeof raw !== "object") {
    throw new Error("n2kClassicSerializer: serialized state must be an object");
  }
  const obj = raw as Partial<SerializedN2KClassicState>;
  if (obj.v !== 1) {
    throw new Error(
      `n2kClassicSerializer: unsupported wire version ${String(obj.v)} (expected 1)`,
    );
  }
  if (obj.config === undefined) {
    throw new Error("n2kClassicSerializer: missing 'config' field");
  }
  if (!Array.isArray(obj.claimed)) {
    throw new Error("n2kClassicSerializer: 'claimed' must be an array");
  }
  if (!Array.isArray(obj.playerIds)) {
    throw new Error("n2kClassicSerializer: 'playerIds' must be an array");
  }
  if (!Array.isArray(obj.consecutivePasses)) {
    throw new Error("n2kClassicSerializer: 'consecutivePasses' must be an array");
  }
  if (!Array.isArray(obj.dicePool)) {
    throw new Error("n2kClassicSerializer: 'dicePool' must be an array");
  }

  const mode = wireToMode(obj.config.modeId);

  const config: N2KClassicConfig = {
    board: obj.config.board,
    mode,
    initialDicePool: obj.config.initialDicePool,
    ...(obj.config.turnLimit !== undefined ? { turnLimit: obj.config.turnLimit } : {}),
    ...(obj.config.rngSeed !== undefined ? { rngSeed: obj.config.rngSeed } : {}),
  };

  const claimed = new Map<number, ClaimedCell>();
  for (const entry of obj.claimed) {
    const [cellIndex, claim] = entry as [number, SerializedClaim];
    claimed.set(cellIndex, {
      byPlayer: claim.byPlayer,
      equation: rehydrateEquation(claim.equation),
      difficulty: claim.difficulty,
    });
  }

  const consecutivePasses = new Map<PlayerId, number>();
  for (const [id, n] of obj.consecutivePasses as ReadonlyArray<readonly [PlayerId, number]>) {
    consecutivePasses.set(id, n);
  }

  return {
    config,
    playerIds: obj.playerIds,
    dicePool: obj.dicePool,
    claimed,
    currentPlayerIdx: obj.currentPlayerIdx ?? 0,
    turn: obj.turn ?? 0,
    consecutivePasses,
  };
}

/** Re-freeze numeric arrays so equality compares element-wise. */
function rehydrateEquation(eq: NEquation): NEquation {
  return {
    dice: [...eq.dice],
    exps: [...eq.exps],
    ops: [...eq.ops] as Operator[],
    total: eq.total,
  };
}
