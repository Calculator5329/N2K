import { describe, expect, it } from "vitest";
import { OP, STANDARD_MODE } from "../../src/core/constants.js";
import type { Board } from "../../src/core/types.js";
import {
  replay,
  type LoggedMove,
  type PlayerSlot,
} from "../../src/services/gameKernel.js";
import {
  n2kClassicGame,
  type N2KClassicConfig,
  type N2KClassicMove,
  type N2KClassicState,
} from "../../src/games/n2kClassic.js";
import {
  EASY_PERSONA,
  HARD_PERSONA,
  STANDARD_PERSONA,
} from "../../src/games/personas.js";
import { LocalBot } from "../../src/games/n2kClassicBots.js";

const ALICE: PlayerSlot = { id: "alice", displayName: "Alice" };
const BOB: PlayerSlot = { id: "bob", displayName: "Bob" };

function smallBoard(cells: readonly number[]): Board {
  return { rows: 3, cols: 3, cells };
}

function makeConfig(): N2KClassicConfig {
  return {
    board: smallBoard([4, 6, 8, 10, 11, 13, 15, 16, 30]),
    mode: STANDARD_MODE,
    initialDicePool: [2, 3, 5],
  };
}

const instantDelay = (_ms: number) => Promise.resolve();

describe("replay() reconstructs N2K Classic sessions", () => {
  it("a hand-crafted move log replays to the same final state", () => {
    const config = makeConfig();
    const players = [ALICE, BOB];
    let s = n2kClassicGame.init(config, players);

    const log: LoggedMove<N2KClassicMove>[] = [];

    function record(move: N2KClassicMove, by: string): void {
      log.push({ move, byPlayer: by, at: log.length });
      s = n2kClassicGame.applyMove(s, move, by);
    }

    // alice claims target 10 with 2+3+5
    record(
      {
        kind: "claim",
        cellIndex: 3,
        equation: { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.ADD, OP.ADD], total: 10 },
      },
      "alice",
    );
    // bob passes
    record({ kind: "pass" }, "bob");
    // alice claims target 30 with 2*3*5
    record(
      {
        kind: "claim",
        cellIndex: 8,
        equation: { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.MUL, OP.MUL], total: 30 },
      },
      "alice",
    );
    // bob claims target 11 with 2*3+5
    record(
      {
        kind: "claim",
        cellIndex: 4,
        equation: { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.MUL, OP.ADD], total: 11 },
      },
      "bob",
    );

    const replayed = replay(n2kClassicGame, config, players, log);
    expect(replayed).toEqual(s);
  });

  it("a bot-vs-bot session replays losslessly", async () => {
    const config = makeConfig();
    const players = [ALICE, BOB];
    let s: N2KClassicState = n2kClassicGame.init(config, players);
    const easy = new LocalBot({ persona: EASY_PERSONA, id: "alice", rngSeed: 11, delay: instantDelay });
    const hard = new LocalBot({ persona: HARD_PERSONA, id: "bob", rngSeed: 22, delay: instantDelay });
    const log: LoggedMove<N2KClassicMove>[] = [];

    for (let t = 0; t < 8 && !n2kClassicGame.isTerminal(s); t += 1) {
      const id = n2kClassicGame.currentPlayer(s)!;
      const legal = n2kClassicGame.legalMoves(s, id);
      const bot = id === "alice" ? easy : hard;
      const move = (await bot.pickMove(s, legal)) as N2KClassicMove;
      log.push({ move, byPlayer: id, at: t });
      s = n2kClassicGame.applyMove(s, move, id);
    }

    const replayed = replay(n2kClassicGame, config, players, log);
    expect(replayed).toEqual(s);
  });

  it("a tampered log (illegal move) makes replay throw", () => {
    const config = makeConfig();
    const players = [ALICE, BOB];
    const log: LoggedMove<N2KClassicMove>[] = [
      // alice claims target 10
      {
        move: {
          kind: "claim",
          cellIndex: 3,
          equation: { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.ADD, OP.ADD], total: 10 },
        },
        byPlayer: "alice",
        at: 0,
      },
      // bob attempts to also claim target 10 — illegal
      {
        move: {
          kind: "claim",
          cellIndex: 3,
          equation: { dice: [2, 3, 5], exps: [1, 1, 1], ops: [OP.ADD, OP.ADD], total: 10 },
        },
        byPlayer: "bob",
        at: 1,
      },
    ];
    expect(() => replay(n2kClassicGame, config, players, log)).toThrow(/already claimed/);
  });
});

void STANDARD_PERSONA;
