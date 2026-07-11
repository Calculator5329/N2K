import { makeAutoObservable } from "mobx";
import {
  completeDailyChallenge,
  loadDailyBest,
  todaysDailyChallenge,
  type DailyChallenge,
  type DailyCompletion,
  type DailyStorage,
} from "@platform/services/dailyChallenge.js";
import type { PlayStore } from "./PlayStore.js";

const memoryStorage = (): DailyStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
};

function browserStorage(): DailyStorage {
  return typeof window === "undefined" ? memoryStorage() : window.localStorage;
}

/** Web-facing lifecycle for today's deterministic local challenge. */
export class DailyChallengeStore {
  readonly challenge: DailyChallenge;
  bestBeforeAttempt = null as DailyCompletion["best"] | null;
  completion = null as DailyCompletion | null;
  active = false;

  constructor(
    private readonly storage: DailyStorage = browserStorage(),
    now: Date = new Date(),
  ) {
    this.challenge = todaysDailyChallenge(now);
    this.bestBeforeAttempt = loadDailyBest(storage, this.challenge.dateKey);
    makeAutoObservable<this, "storage">(this, {
      storage: false,
      challenge: false,
    });
  }

  launch(play: PlayStore): void {
    this.active = true;
    this.completion = null;
    play.setSetup({ rules: "standard" });
    play.start({
      board: this.challenge.board.cells,
      playerDice: this.challenge.dice,
      botDice: this.challenge.dice,
      onFinished: (summary) => {
        this.completion = completeDailyChallenge(this.storage, {
          dateKey: this.challenge.dateKey,
          score: summary.playerScore,
          cellsCleared: summary.playerCellsKnocked,
          elapsedMs: summary.elapsedMs,
          completedAt: new Date().toISOString(),
        });
        this.bestBeforeAttempt = this.completion.best;
      },
    });
  }

  leave(): void {
    this.active = false;
    this.completion = null;
  }
}
