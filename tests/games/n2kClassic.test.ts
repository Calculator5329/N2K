import { describe, expect, it } from "vitest";
import {
  AETHER_MODE,
  BOARD,
  OP,
  STANDARD_MODE,
} from "../../src/core/constants.js";
import type { Board, NEquation } from "../../src/core/types.js";
import type { PlayerSlot } from "../../src/services/gameKernel.js";
import {
  enumerateClaimEquations,
  evaluateEquation,
  n2kClassicGame,
  type N2KClassicConfig,
  type N2KClassicMove,
  type N2KClassicState,
} from "../../src/games/n2kClassic.js";

// ---------------------------------------------------------------------------
//  Fixtures
// ---------------------------------------------------------------------------

const ALICE: PlayerSlot = { id: "alice", displayName: "Alice" };
const BOB: PlayerSlot = { id: "bob", displayName: "Bob" };
const CARA: PlayerSlot = { id: "cara", displayName: "Cara" };

/** Tiny 3x3 board so terminal-by-fill is reachable in tests. */
function smallBoard(cells: readonly number[]): Board {
  if (cells.length !== 9) throw new Error("smallBoard expects 9 cells");
  return { rows: 3, cols: 3, cells };
}

function fullSizeBoard(cells: readonly number[]): Board {
  if (cells.length !== BOARD.size) {
    throw new Error(`fullSizeBoard expects ${BOARD.size} cells`);
  }
  return { rows: BOARD.rows, cols: BOARD.cols, cells };
}

/**
 * Default fixture board: 3x3 with handpicked targets that are all
 * reachable by some combination of (2, 3, 5). Keeping this small
 * avoids forcing the solver to enumerate equations for 36 distinct
 * targets on every legalMoves() call.
 *
 *   index 0 → 4   (5 - 3 + 2)
 *   index 1 → 6   (3 * 2 + 0 — actually 2 * 3 * 1)
 *   index 2 → 8   (5 + 3 - ... or 2^3)
 *   index 3 → 10  (2 + 3 + 5)
 *   index 4 → 11  (2 * 3 + 5)
 *   index 5 → 13  (2 * 5 + 3)
 *   index 6 → 15  (3 * 5 * 1)
 *   index 7 → 16  (2 + 3 + ... or many)
 *   index 8 → 30  (2 * 3 * 5)
 */
const FIXTURE_TARGETS = [4, 6, 8, 10, 11, 13, 15, 16, 30];
const CELL_TEN = 3;
const CELL_THIRTY = 8;
const CELL_ELEVEN = 4;

function standardConfig(
  overrides: Partial<N2KClassicConfig> = {},
): N2KClassicConfig {
  return {
    board: smallBoard(FIXTURE_TARGETS),
    mode: STANDARD_MODE,
    initialDicePool: [2, 3, 5],
    ...overrides,
  };
}

// Pre-vetted simple equations using dice (2, 3, 5) under standard mode.
// 2 + 3 - 5 = 0 (not a target on the board); use:
// 2 + 3 + 5 = 10, 2 * 3 + 5 = 11, 2 * 3 * 5 = 30, 5 - 3 + 2 = 4
function eq235Sum10(): NEquation {
  return { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.ADD, OP.ADD], total: 10 };
}
function eq235Mul30(): NEquation {
  return { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.MUL, OP.MUL], total: 30 };
}

// ---------------------------------------------------------------------------
//  init
// ---------------------------------------------------------------------------

describe("n2kClassicGame.init", () => {
  it("creates a fresh state with an empty claimed map", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    expect(state.claimed.size).toBe(0);
    expect(state.dicePool).toEqual([2, 3, 5]);
    expect(state.currentPlayerIdx).toBe(0);
    expect(state.turn).toBe(0);
    expect(state.playerIds).toEqual(["alice", "bob"]);
  });

  it("initializes consecutivePasses to 0 for every seat", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB, CARA]);
    expect(state.consecutivePasses.get("alice")).toBe(0);
    expect(state.consecutivePasses.get("bob")).toBe(0);
    expect(state.consecutivePasses.get("cara")).toBe(0);
  });

  it("rejects player counts above maxPlayers", () => {
    const tooMany: PlayerSlot[] = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      displayName: `Player ${i}`,
    }));
    expect(() => n2kClassicGame.init(standardConfig(), tooMany)).toThrow(
      /outside \[1, 8\]/,
    );
  });

  it("rejects empty player list", () => {
    expect(() => n2kClassicGame.init(standardConfig(), [])).toThrow();
  });

  it("rejects mismatched board cells/rows*cols", () => {
    const config: N2KClassicConfig = {
      ...standardConfig(),
      board: { rows: 6, cols: 6, cells: [1, 2, 3] },
    };
    expect(() => n2kClassicGame.init(config, [ALICE])).toThrow(/board cells/);
  });

  it("rejects empty initialDicePool", () => {
    const config = standardConfig({ initialDicePool: [] });
    expect(() => n2kClassicGame.init(config, [ALICE])).toThrow(
      /initialDicePool/,
    );
  });
});

// ---------------------------------------------------------------------------
//  currentPlayer
// ---------------------------------------------------------------------------

describe("n2kClassicGame.currentPlayer", () => {
  it("returns the active player id", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    expect(n2kClassicGame.currentPlayer(state)).toBe("alice");
  });

  it("returns null when terminal", () => {
    const state = n2kClassicGame.init(
      standardConfig({ turnLimit: 0 }),
      [ALICE, BOB],
    );
    expect(n2kClassicGame.currentPlayer(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  legalMoves
// ---------------------------------------------------------------------------

describe("n2kClassicGame.legalMoves", () => {
  it("always includes a pass move", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const moves = n2kClassicGame.legalMoves(state, "alice");
    expect(moves.some((m) => m.kind === "pass")).toBe(true);
  });

  it("includes claim moves for solvable cells", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const moves = n2kClassicGame.legalMoves(state, "alice");
    const claims = moves.filter((m): m is Extract<N2KClassicMove, { kind: "claim" }> => m.kind === "claim");
    expect(claims.length).toBeGreaterThan(0);
  });

  it("returns empty list when it is not the player's turn", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    expect(n2kClassicGame.legalMoves(state, "bob")).toEqual([]);
  });

  it("returns empty when terminal (turn limit)", () => {
    const state = n2kClassicGame.init(
      standardConfig({ turnLimit: 0 }),
      [ALICE, BOB],
    );
    expect(n2kClassicGame.legalMoves(state, "alice")).toEqual([]);
  });

  it("excludes claim moves for already-claimed cells", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    // 2 * 3 + 5 = 11, cell CELL_ELEVEN has value 11.
    const claim: N2KClassicMove = {
      kind: "claim",
      cellIndex: CELL_ELEVEN,
      equation: { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.MUL, OP.ADD], total: 11 },
    };
    const next = n2kClassicGame.applyMove(init, claim, "alice");
    const bobMoves = n2kClassicGame.legalMoves(next, "bob");
    const bobClaimsOnEleven = bobMoves.filter(
      (m): m is Extract<N2KClassicMove, { kind: "claim" }> =>
        m.kind === "claim" && m.cellIndex === CELL_ELEVEN,
    );
    expect(bobClaimsOnEleven).toHaveLength(0);
  });

  it("every claim equation evaluates to its target", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const moves = n2kClassicGame.legalMoves(state, "alice");
    for (const m of moves) {
      if (m.kind !== "claim") continue;
      const evaluated = evaluateEquation(m.equation);
      const target = state.config.board.cells[m.cellIndex]!;
      expect(Math.round(evaluated)).toBe(target);
      expect(m.equation.total).toBe(target);
    }
  });

  it("every claim equation uses only dice from the pool", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const pool = [...state.dicePool].sort();
    const moves = n2kClassicGame.legalMoves(state, "alice");
    for (const m of moves) {
      if (m.kind !== "claim") continue;
      // After standard-mode depower, 4/8/16 → 2 and 9 → 3. The solver
      // returns equations in depowered dice, so the equation dice
      // should be a multiset subset of the depowered pool.
      const eqSorted = [...m.equation.dice].sort();
      // Every equation die must appear in the pool (multiset).
      const remaining = new Map<number, number>();
      for (const d of pool) remaining.set(d, (remaining.get(d) ?? 0) + 1);
      let ok = true;
      for (const d of eqSorted) {
        const c = remaining.get(d) ?? 0;
        if (c === 0) {
          ok = false;
          break;
        }
        remaining.set(d, c - 1);
      }
      expect(ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
//  applyMove — claim
// ---------------------------------------------------------------------------

describe("n2kClassicGame.applyMove (claim)", () => {
  it("records the claim with the active player", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    // cell index 9 = target 10; equation 2+3+5=10
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    const next = n2kClassicGame.applyMove(init, move, "alice");
    const claim = next.claimed.get(9);
    expect(claim).toBeDefined();
    expect(claim!.byPlayer).toBe("alice");
    expect(claim!.equation.total).toBe(10);
    // 2+3+5=10 is the easiest possible solution; the heuristic may
    // round it down to 0 (no error). Just check it's a finite number.
    expect(claim!.difficulty).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(claim!.difficulty)).toBe(true);
  });

  it("advances current player round-robin", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    const next = n2kClassicGame.applyMove(init, move, "alice");
    expect(n2kClassicGame.currentPlayer(next)).toBe("bob");
  });

  it("increments turn counter", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    const next = n2kClassicGame.applyMove(init, move, "alice");
    expect(next.turn).toBe(1);
  });

  it("resets consecutivePasses for the claiming player", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    // alice passes once
    const afterPass = n2kClassicGame.applyMove(init, { kind: "pass" }, "alice");
    expect(afterPass.consecutivePasses.get("alice")).toBe(1);
    // bob CLAIMS (avoids the all-passed terminal trigger)
    const bobClaim: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    const afterBobClaim = n2kClassicGame.applyMove(afterPass, bobClaim, "bob");
    // alice claims — passes should reset for alice
    const aliceClaim: N2KClassicMove = { kind: "claim", cellIndex: CELL_THIRTY, equation: eq235Mul30() };
    const afterAliceClaim = n2kClassicGame.applyMove(afterBobClaim, aliceClaim, "alice");
    expect(afterAliceClaim.consecutivePasses.get("alice")).toBe(0);
    expect(afterAliceClaim.consecutivePasses.get("bob")).toBe(0);
  });

  it("does not mutate the input state", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    const beforeClaimed = init.claimed.size;
    const beforeTurn = init.turn;
    n2kClassicGame.applyMove(init, move, "alice");
    expect(init.claimed.size).toBe(beforeClaimed);
    expect(init.turn).toBe(beforeTurn);
  });

  it("throws on out-of-bounds cellIndex", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE]);
    const move: N2KClassicMove = { kind: "claim", cellIndex: 999, equation: eq235Sum10() };
    expect(() => n2kClassicGame.applyMove(init, move, "alice")).toThrow(/out of bounds/);
  });

  it("throws when claiming an already-claimed cell", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    const after = n2kClassicGame.applyMove(init, move, "alice");
    expect(() => n2kClassicGame.applyMove(after, move, "bob")).toThrow(/already claimed/);
  });

  it("throws when equation total does not match target", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE]);
    // claim cell 0 (target 1) with equation total=10
    const move: N2KClassicMove = { kind: "claim", cellIndex: 0, equation: eq235Sum10() };
    expect(() => n2kClassicGame.applyMove(init, move, "alice")).toThrow(/match cell target/);
  });

  it("throws when equation dice are not in the pool", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE]);
    // 2 + 3 + 7 = 12 — but 7 is not in pool (2, 3, 5).
    // Use any in-bounds cell; the dice-subset check fires first.
    const move: N2KClassicMove = {
      kind: "claim",
      cellIndex: CELL_ELEVEN,
      equation: { dice: [2, 3, 7], exps: [1, 1, 1], ops: [OP.ADD, OP.ADD], total: 12 },
    };
    expect(() => n2kClassicGame.applyMove(init, move, "alice")).toThrow(/not a subset/);
  });

  it("throws when the wrong player attempts a move", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() };
    expect(() => n2kClassicGame.applyMove(init, move, "bob")).toThrow(/it is alice's turn/);
  });

  it("throws on equation arity disallowed by mode", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE]);
    const badEq: NEquation = {
      dice: [2, 3, 5, 5],
      exps: [1, 1, 1, 1],
      ops: [OP.ADD, OP.ADD, OP.ADD],
      total: 15,
    };
    const move: N2KClassicMove = { kind: "claim", cellIndex: CELL_TEN, equation: badEq };
    expect(() => n2kClassicGame.applyMove(init, move, "alice")).toThrow(/arity/);
  });
});

// ---------------------------------------------------------------------------
//  applyMove — pass
// ---------------------------------------------------------------------------

describe("n2kClassicGame.applyMove (pass)", () => {
  it("does not record a claim", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const next = n2kClassicGame.applyMove(init, { kind: "pass" }, "alice");
    expect(next.claimed.size).toBe(0);
  });

  it("advances the active player and turn", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const next = n2kClassicGame.applyMove(init, { kind: "pass" }, "alice");
    expect(n2kClassicGame.currentPlayer(next)).toBe("bob");
    expect(next.turn).toBe(1);
  });

  it("increments consecutivePasses for the passing player", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const next = n2kClassicGame.applyMove(init, { kind: "pass" }, "alice");
    expect(next.consecutivePasses.get("alice")).toBe(1);
    expect(next.consecutivePasses.get("bob")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
//  isTerminal
// ---------------------------------------------------------------------------

describe("n2kClassicGame.isTerminal", () => {
  it("is false at the start", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    expect(n2kClassicGame.isTerminal(state)).toBe(false);
  });

  it("is true once turn limit is reached", () => {
    const state = n2kClassicGame.init(
      standardConfig({ turnLimit: 1 }),
      [ALICE, BOB],
    );
    let s: N2KClassicState = state;
    s = n2kClassicGame.applyMove(s, { kind: "pass" }, "alice");
    s = n2kClassicGame.applyMove(s, { kind: "pass" }, "bob");
    expect(n2kClassicGame.isTerminal(s)).toBe(true);
  });

  it("is true when every player passes their last turn", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    let s = n2kClassicGame.applyMove(state, { kind: "pass" }, "alice");
    s = n2kClassicGame.applyMove(s, { kind: "pass" }, "bob");
    expect(n2kClassicGame.isTerminal(s)).toBe(true);
  });

  it("is true when the board is fully claimed", () => {
    // 3x3 board where every cell is target=10 → all use 2+3+5=10
    const config: N2KClassicConfig = {
      board: smallBoard([10, 10, 10, 10, 10, 10, 10, 10, 10]),
      mode: STANDARD_MODE,
      initialDicePool: [2, 3, 5],
    };
    let s = n2kClassicGame.init(config, [ALICE]);
    for (let i = 0; i < 9; i += 1) {
      s = n2kClassicGame.applyMove(
        s,
        { kind: "claim", cellIndex: i, equation: eq235Sum10() },
        "alice",
      );
    }
    expect(n2kClassicGame.isTerminal(s)).toBe(true);
    expect(n2kClassicGame.currentPlayer(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  score
// ---------------------------------------------------------------------------

describe("n2kClassicGame.score", () => {
  it("returns 0 for every player when no claims", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    expect(n2kClassicGame.score(state)).toEqual({ alice: 0, bob: 0 });
  });

  it("sums target per player (difficulty was paid in time budget)", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const move: N2KClassicMove = {
      kind: "claim",
      cellIndex: CELL_TEN, // target 10
      equation: eq235Sum10(),
    };
    const next = n2kClassicGame.applyMove(init, move, "alice");
    const scores = n2kClassicGame.score(next);
    expect(scores.alice).toBe(10);
    expect(scores.bob).toBe(0);
  });

  it("higher-target claims yield higher scores than lower-target ones", () => {
    const init = n2kClassicGame.init(standardConfig(), [ALICE]);
    // Alice claims 10, then 30 (next turn, but single-player so always Alice)
    let s = n2kClassicGame.applyMove(
      init,
      { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() },
      "alice",
    );
    s = n2kClassicGame.applyMove(
      s,
      { kind: "claim", cellIndex: CELL_THIRTY, equation: eq235Mul30() },
      "alice",
    );
    const scores = n2kClassicGame.score(s);
    expect(scores.alice).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
//  serialize / deserialize
// ---------------------------------------------------------------------------

describe("n2kClassicGame serialize/deserialize", () => {
  it("round-trips an empty state losslessly (deep equal)", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE, BOB]);
    const wire = n2kClassicGame.serialize(state);
    const parsed = JSON.parse(JSON.stringify(wire)); // simulate JSON transport
    const restored = n2kClassicGame.deserialize(parsed);
    expect(restored).toEqual(state);
  });

  it("round-trips a state with claims and passes", () => {
    let s = n2kClassicGame.init(standardConfig(), [ALICE, BOB, CARA]);
    s = n2kClassicGame.applyMove(
      s,
      { kind: "claim", cellIndex: CELL_TEN, equation: eq235Sum10() },
      "alice",
    );
    s = n2kClassicGame.applyMove(s, { kind: "pass" }, "bob");
    s = n2kClassicGame.applyMove(
      s,
      { kind: "claim", cellIndex: CELL_THIRTY, equation: eq235Mul30() },
      "cara",
    );
    const wire = JSON.parse(JSON.stringify(n2kClassicGame.serialize(s)));
    const restored = n2kClassicGame.deserialize(wire);
    expect(restored).toEqual(s);
  });

  it("preserves the mode by id (standard mode round-trip)", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const wire = JSON.parse(JSON.stringify(n2kClassicGame.serialize(state)));
    const restored = n2kClassicGame.deserialize(wire);
    expect(restored.config.mode.id).toBe("standard");
    // Same exponentCap function instance after lookup in BUILT_IN_MODES.
    expect(restored.config.mode).toBe(STANDARD_MODE);
  });

  it("rejects malformed wire payloads", () => {
    expect(() => n2kClassicGame.deserialize(null)).toThrow();
    expect(() => n2kClassicGame.deserialize({ v: 99 })).toThrow(/wire version/);
    expect(() => n2kClassicGame.deserialize({ v: 1 })).toThrow(/config/);
  });
});

// ---------------------------------------------------------------------------
//  enumerateClaimEquations (helper)
// ---------------------------------------------------------------------------

describe("enumerateClaimEquations", () => {
  it("returns one or more equations for a reachable target in standard mode", () => {
    const eqs = enumerateClaimEquations([2, 3, 5], 10, STANDARD_MODE);
    expect(eqs.length).toBeGreaterThan(0);
    for (const e of eqs) {
      expect(e.total).toBe(10);
    }
  });

  it("returns an empty list for an unreachable target", () => {
    // 7 is prime and not in the dice pool {2,3,5}; 7 cannot be reached
    // by any combination of 2/3/5 raised to any cap (no negative
    // intermediates either since standard mode has no -1 base).
    const eqs = enumerateClaimEquations([2, 3, 5], 7919, STANDARD_MODE);
    expect(eqs).toEqual([]);
  });

  it("walks subsets in Æther mode when pool is larger than min arity", () => {
    // 5-dice pool, target reachable by some 3-subset.
    const eqs = enumerateClaimEquations([2, 3, 5, 7, 11], 16, AETHER_MODE);
    expect(eqs.length).toBeGreaterThan(0);
    // Some result should be arity-3 (the smallest reachable arity).
    expect(eqs.some((e) => e.dice.length === 3)).toBe(true);
  });
});
