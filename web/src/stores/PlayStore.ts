/**
 * `PlayStore` — drives a single N2K Classic match.
 *
 * Wraps `n2kClassicGame` from the platform games module, manages the
 * match state machine reactively for React, and orchestrates the bot's
 * turn via `LocalBot`. The human player picks moves via the view; bots
 * tick automatically when it's their turn.
 */
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import {
  BUILT_IN_MODES,
  BOARD,
} from "@platform/core/constants.js";
import {
  generateRandomBoard,
  generateRandomDice,
} from "@platform/services/generators.js";
import type { Board, Mode, NEquation } from "@platform/core/types.js";
import {
  n2kClassicGame,
  enumerateClaimEquations,
  type N2KClassicConfig,
  type N2KClassicMove,
  type N2KClassicState,
} from "@platform/games/n2kClassic.js";
import {
  LocalBot,
  type LocalBotOptions,
} from "@platform/games/n2kClassicBots.js";
import {
  EASY_PERSONA,
  STANDARD_PERSONA,
  HARD_PERSONA,
  AETHER_PERSONA,
  PERSONAS,
  personasForMode,
  type Persona,
  type PersonaId,
} from "@platform/games/personas.js";

void EASY_PERSONA;
void STANDARD_PERSONA;
void HARD_PERSONA;
void AETHER_PERSONA;
void PERSONAS;

export type PlayModeId = "standard" | "aether";

export interface MatchSetup {
  readonly modeId: PlayModeId;
  readonly humanFirst: boolean;
  readonly botPersonaId: PersonaId;
}

const DEFAULT_SETUP: MatchSetup = {
  modeId: "standard",
  humanFirst: true,
  botPersonaId: "standard",
};

export class PlayStore {
  setup: MatchSetup = DEFAULT_SETUP;
  state: N2KClassicState | null = null;
  scoreboard: Record<string, number> = {};
  isBotThinking = false;
  lastError: string | null = null;
  selectedCellIndex: number | null = null;

  private bot: LocalBot | null = null;

  constructor() {
    makeObservable(this, {
      setup: observable,
      state: observable.ref,
      scoreboard: observable,
      isBotThinking: observable,
      lastError: observable,
      selectedCellIndex: observable,
      mode: computed,
      isMyTurn: computed,
      isTerminal: computed,
      currentPlayer: computed,
      claimOptionsForCell: false,
      setSetup: action,
      startMatch: action,
      selectCell: action,
      claimWith: action,
      pass: action,
      restart: action,
    });
  }

  get mode(): Mode {
    return BUILT_IN_MODES[this.setup.modeId];
  }

  get isTerminal(): boolean {
    return this.state !== null && n2kClassicGame.isTerminal(this.state);
  }

  get currentPlayer(): string | null {
    return this.state === null ? null : n2kClassicGame.currentPlayer(this.state);
  }

  get isMyTurn(): boolean {
    return this.currentPlayer === "human";
  }

  setSetup(patch: Partial<MatchSetup>): void {
    this.setup = { ...this.setup, ...patch };
  }

  startMatch(): void {
    const mode = this.mode;
    const eligible = personasForMode(mode);
    const personaId = eligible.some((p) => p.id === this.setup.botPersonaId)
      ? this.setup.botPersonaId
      : (eligible[0]?.id ?? "standard");
    const persona: Persona = eligible.find((p) => p.id === personaId)!;

    const board = makeBoard(mode);
    const dicePool = generateRandomDice(mode);
    const config: N2KClassicConfig = {
      board,
      mode,
      initialDicePool: dicePool,
    };
    const human = { id: "human", displayName: "You" };
    const bot = { id: "bot", displayName: persona.displayName };
    const players = this.setup.humanFirst ? [human, bot] : [bot, human];

    this.state = n2kClassicGame.init(config, players);
    this.scoreboard = n2kClassicGame.score(this.state);
    this.lastError = null;
    this.selectedCellIndex = null;
    this.bot = new LocalBot({ persona, id: "bot" } satisfies LocalBotOptions);

    if (this.currentPlayer === "bot") {
      void this.runBotTurn();
    }
  }

  restart(): void {
    this.state = null;
    this.scoreboard = {};
    this.bot = null;
    this.selectedCellIndex = null;
    this.lastError = null;
  }

  selectCell(index: number | null): void {
    this.selectedCellIndex = index;
  }

  claimOptionsForCell(index: number): readonly NEquation[] {
    if (this.state === null || this.state.claimed.has(index)) return [];
    const target = this.state.config.board.cells[index];
    if (target === undefined) return [];
    const eqs = enumerateClaimEquations(this.state.dicePool, target, this.state.config.mode);
    return eqs.slice(0, 12);
  }

  claimWith(index: number, equation: NEquation): void {
    if (this.state === null || !this.isMyTurn) return;
    try {
      const move: N2KClassicMove = { kind: "claim", cellIndex: index, equation };
      const next = n2kClassicGame.applyMove(this.state, move, "human");
      this.state = next;
      this.scoreboard = n2kClassicGame.score(next);
      this.selectedCellIndex = null;
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    if (!this.isTerminal && this.currentPlayer === "bot") {
      void this.runBotTurn();
    }
  }

  pass(): void {
    if (this.state === null || !this.isMyTurn) return;
    try {
      const next = n2kClassicGame.applyMove(this.state, { kind: "pass" }, "human");
      this.state = next;
      this.scoreboard = n2kClassicGame.score(next);
      this.selectedCellIndex = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    if (!this.isTerminal && this.currentPlayer === "bot") {
      void this.runBotTurn();
    }
  }

  private async runBotTurn(): Promise<void> {
    if (this.bot === null || this.state === null) return;
    runInAction(() => {
      this.isBotThinking = true;
    });
    try {
      while (this.state !== null && !this.isTerminal && this.currentPlayer === "bot") {
        const legal = n2kClassicGame.legalMoves(this.state, "bot");
        if (legal.length === 0) break;
        const move = await this.bot.pickMove(this.state, legal);
        runInAction(() => {
          if (this.state === null) return;
          this.state = n2kClassicGame.applyMove(this.state, move, "bot");
          this.scoreboard = n2kClassicGame.score(this.state);
        });
      }
    } catch (err) {
      runInAction(() => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.isBotThinking = false;
      });
    }
  }
}

function makeBoard(mode: Mode): Board {
  const cells = generateRandomBoard(mode, {
    range: { min: 1, max: 99 },
  });
  return {
    rows: BOARD.rows,
    cols: BOARD.cols,
    cells,
  };
}
