import { describe, expect, it } from "vitest";
import {
  AETHER_MODE,
  OP,
  STANDARD_MODE,
} from "../../src/core/constants.js";
import type { Board, NEquation } from "../../src/core/types.js";
import type { PlayerSlot } from "../../src/services/gameKernel.js";
import {
  n2kClassicGame,
  type N2KClassicConfig,
  type N2KClassicMove,
  type N2KClassicState,
} from "../../src/games/n2kClassic.js";
import {
  buildAllBasesCache,
  difficultyOfEquation,
} from "../../src/services/difficulty.js";
import {
  EASY_PERSONA,
  HARD_PERSONA,
  STANDARD_PERSONA,
  AETHER_PERSONA,
  PERSONAS,
  personasForMode,
  getPersona,
  type Persona,
} from "../../src/games/personas.js";
import {
  LocalBot,
  RandomLegalPlayer,
} from "../../src/games/n2kClassicBots.js";

// ---------------------------------------------------------------------------
//  Fixtures
// ---------------------------------------------------------------------------

const ALICE: PlayerSlot = { id: "alice", displayName: "Alice" };
const BOB: PlayerSlot = { id: "bob", displayName: "Bob" };

function smallBoard(cells: readonly number[]): Board {
  return { rows: 3, cols: 3, cells };
}

function standardConfig(
  overrides: Partial<N2KClassicConfig> = {},
): N2KClassicConfig {
  return {
    board: smallBoard([4, 6, 8, 10, 11, 13, 15, 16, 30]),
    mode: STANDARD_MODE,
    initialDicePool: [2, 3, 5],
    ...overrides,
  };
}

/** A no-op delay so tests don't actually wait on persona.thinkMs. */
const instantDelay = (_ms: number) => Promise.resolve();

// ---------------------------------------------------------------------------
//  Personas
// ---------------------------------------------------------------------------

describe("personas", () => {
  it("exposes four personas", () => {
    expect(PERSONAS).toHaveLength(4);
    const ids = PERSONAS.map((p) => p.id).sort();
    expect(ids).toEqual(["aether", "easy", "hard", "standard"]);
  });

  it("getPersona returns the matching record", () => {
    expect(getPersona("easy").displayName).toBe("Easy");
    expect(() => getPersona("nope" as any)).toThrow();
  });

  it("each persona has a non-trivial difficulty target", () => {
    for (const p of PERSONAS) {
      expect(p.difficultyTarget.min).toBeLessThanOrEqual(p.difficultyTarget.max);
      expect(p.passThreshold).toBeGreaterThan(0);
      expect(p.thinkMs).toBeGreaterThan(0);
      expect(p.mistakeRate).toBeGreaterThanOrEqual(0);
      expect(p.mistakeRate).toBeLessThanOrEqual(1);
    }
  });

  it("Hard's mistake rate is lower than Easy's", () => {
    expect(HARD_PERSONA.mistakeRate).toBeLessThan(EASY_PERSONA.mistakeRate);
  });

  it("Hard takes longer to think than Easy", () => {
    expect(HARD_PERSONA.thinkMs).toBeGreaterThan(EASY_PERSONA.thinkMs);
  });

  it("personasForMode excludes Æther in standard mode", () => {
    const std = personasForMode(STANDARD_MODE);
    expect(std.some((p) => p.id === "aether")).toBe(false);
    expect(std).toHaveLength(3);
  });

  it("personasForMode includes Æther in Æther mode", () => {
    const ae = personasForMode(AETHER_MODE);
    expect(ae.some((p) => p.id === "aether")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
//  LocalBot
// ---------------------------------------------------------------------------

describe("LocalBot.selectMove", () => {
  function makeBot(persona: Persona, seed = 1): LocalBot {
    return new LocalBot({
      persona,
      id: "bot1",
      rngSeed: seed,
      delay: instantDelay,
    });
  }

  it("picks a claim move when one is in the persona band", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    const bot = makeBot(EASY_PERSONA);
    const choice = bot.selectMove(state, legal);
    expect(choice.kind).toBe("claim");
  });

  it("passes when only pass is legal", () => {
    const bot = makeBot(STANDARD_PERSONA);
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const choice = bot.selectMove(state, [{ kind: "pass" }]);
    expect(choice).toEqual({ kind: "pass" });
  });

  it("passes when every claim is above passThreshold", () => {
    // Hand-feed legal moves: only one claim, with a deliberately
    // expensive equation under standard mode (2^5 + 3^4 + 5 = 118 → high
    // exponents push difficulty well above 0.001). The persona's tight
    // pass threshold then forces the bot to pass instead of claim.
    const veryStrictPersona: Persona = {
      ...HARD_PERSONA,
      passThreshold: 0.001,
      difficultyTarget: { min: 0, max: 0.001 },
    };
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const hardEquation: NEquation = {
      dice: [2, 3, 5],
      exps: [5, 4, 1],
      ops: [OP.ADD, OP.ADD],
      total: 32 + 81 + 5,
    };
    const legal: readonly N2KClassicMove[] = [
      { kind: "pass" },
      { kind: "claim", cellIndex: 0, equation: hardEquation },
    ];
    const bot = makeBot(veryStrictPersona);
    const choice = bot.selectMove(state, legal);
    expect(choice.kind).toBe("pass");
  });

  it("respects the difficulty target — every chosen claim falls inside the band", () => {
    // Run many independent picks against the same legal set; assert
    // the picked difficulty is always inside the persona band.
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    for (let seed = 0; seed < 50; seed += 1) {
      const bot = makeBot(STANDARD_PERSONA, seed);
      const choice = bot.selectMove(state, legal);
      if (choice.kind !== "claim") continue;
      const cache = buildAllBasesCache(choice.equation.dice, STANDARD_MODE);
      const d = difficultyOfEquation(choice.equation, STANDARD_MODE, cache);
      expect(d).toBeGreaterThanOrEqual(STANDARD_PERSONA.difficultyTarget.min);
      expect(d).toBeLessThanOrEqual(STANDARD_PERSONA.difficultyTarget.max);
      expect(d).toBeLessThanOrEqual(STANDARD_PERSONA.passThreshold);
    }
  });

  it("Hard persona claims the easiest move on average more often than Easy", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    let hardOptimal = 0;
    let easyOptimal = 0;
    const trials = 100;
    // Find easiest difficulty available.
    let easiest = Number.POSITIVE_INFINITY;
    for (const m of legal) {
      if (m.kind !== "claim") continue;
      const cache = buildAllBasesCache(m.equation.dice, STANDARD_MODE);
      const d = difficultyOfEquation(m.equation, STANDARD_MODE, cache);
      if (d < easiest) easiest = d;
    }
    for (let seed = 0; seed < trials; seed += 1) {
      const hardChoice = makeBot(HARD_PERSONA, seed).selectMove(state, legal);
      const easyChoice = makeBot(EASY_PERSONA, seed).selectMove(state, legal);
      if (hardChoice.kind === "claim") {
        const cache = buildAllBasesCache(hardChoice.equation.dice, STANDARD_MODE);
        if (difficultyOfEquation(hardChoice.equation, STANDARD_MODE, cache) === easiest) {
          hardOptimal += 1;
        }
      }
      if (easyChoice.kind === "claim") {
        const cache = buildAllBasesCache(easyChoice.equation.dice, STANDARD_MODE);
        if (difficultyOfEquation(easyChoice.equation, STANDARD_MODE, cache) === easiest) {
          easyOptimal += 1;
        }
      }
    }
    expect(hardOptimal).toBeGreaterThan(easyOptimal);
  });

  it("seeded bots produce identical picks", () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    const a = makeBot(STANDARD_PERSONA, 42).selectMove(state, legal);
    const b = makeBot(STANDARD_PERSONA, 42).selectMove(state, legal);
    expect(a).toEqual(b);
  });
});

describe("LocalBot.pickMove (async)", () => {
  it("returns a move from the legal set", async () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    const bot = new LocalBot({
      persona: STANDARD_PERSONA,
      id: "alice",
      rngSeed: 1,
      delay: instantDelay,
    });
    const move = (await bot.pickMove(state, legal)) as N2KClassicMove;
    expect(legal).toContain(move);
  });

  it("throws when the legal set is empty", async () => {
    const bot = new LocalBot({
      persona: STANDARD_PERSONA,
      id: "alice",
      delay: instantDelay,
    });
    await expect(bot.pickMove({} as any, [])).rejects.toThrow(/no legal moves/);
  });
});

// ---------------------------------------------------------------------------
//  RandomLegalPlayer
// ---------------------------------------------------------------------------

describe("RandomLegalPlayer", () => {
  it("returns one of the legal moves", async () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    const player = new RandomLegalPlayer("rand", { rngSeed: 7 });
    for (let i = 0; i < 10; i += 1) {
      const move = (await player.pickMove(state, legal)) as N2KClassicMove;
      expect(legal).toContain(move);
    }
  });

  it("seeded picks are reproducible", async () => {
    const state = n2kClassicGame.init(standardConfig(), [ALICE]);
    const legal = n2kClassicGame.legalMoves(state, "alice");
    const a = await new RandomLegalPlayer("a", { rngSeed: 99 }).pickMove(state, legal);
    const b = await new RandomLegalPlayer("a", { rngSeed: 99 }).pickMove(state, legal);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
//  Smoke session — two bots play 5 turns alternating
// ---------------------------------------------------------------------------

describe("smoke session — two bots, 5 turns", () => {
  it("plays a consistent 5-turn match and round-trips serialization", async () => {
    const config = standardConfig();
    const state0 = n2kClassicGame.init(config, [ALICE, BOB]);
    const easyBot = new LocalBot({
      persona: EASY_PERSONA,
      id: "alice",
      rngSeed: 1,
      delay: instantDelay,
    });
    const hardBot = new LocalBot({
      persona: HARD_PERSONA,
      id: "bob",
      rngSeed: 2,
      delay: instantDelay,
    });
    const bots = { alice: easyBot, bob: hardBot } as const;

    let s: N2KClassicState = state0;
    let lastScore = 0;
    for (let turn = 0; turn < 5 && !n2kClassicGame.isTerminal(s); turn += 1) {
      const playerId = n2kClassicGame.currentPlayer(s)!;
      const legal = n2kClassicGame.legalMoves(s, playerId);
      expect(legal.length).toBeGreaterThan(0);
      const bot = bots[playerId as "alice" | "bob"];
      const move = await bot.pickMove(s, legal);
      s = n2kClassicGame.applyMove(s, move as N2KClassicMove, playerId);

      // Invariant: after a claim, the cell is now in `claimed`.
      if ((move as N2KClassicMove).kind === "claim") {
        const m = move as Extract<N2KClassicMove, { kind: "claim" }>;
        expect(s.claimed.has(m.cellIndex)).toBe(true);
      }
      // Invariant: total score is non-negative (no negative-target board).
      const scores = n2kClassicGame.score(s);
      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
      expect(totalScore).toBeGreaterThanOrEqual(0);
      // Total claimed count never decreases.
      expect(s.claimed.size).toBeGreaterThanOrEqual(lastScore);
      lastScore = s.claimed.size;
    }

    // Round-trip the final state.
    const wire = JSON.parse(JSON.stringify(n2kClassicGame.serialize(s)));
    const restored = n2kClassicGame.deserialize(wire);
    expect(restored).toEqual(s);
  });
});

// keep AETHER_PERSONA referenced so future contributors notice it exists.
void AETHER_PERSONA;
