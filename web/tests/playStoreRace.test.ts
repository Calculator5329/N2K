/**
 * PlayStore race rules: validated knocks, the clear bonus scale, and a
 * whole 60 s race on a fake clock for the Easy bot.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayStore, type SharedRace } from "../src/stores/PlayStore";
import { AppStore } from "../src/stores/AppStore";
import { MatchStore } from "../src/features/match/MatchStore";

const PATTERN_8 = Array.from({ length: 36 }, (_, i) => (i + 1) * 8);

describe("PlayStore — validated knocks", () => {
  it("refuses illegal equations with a reason, scores nothing, then accepts a legal one", () => {
    const p = new PlayStore();
    p.start({ board: PATTERN_8, playerDice: [2, 3, 5] });

    p.selectCell(1); // 16
    const wrongValue = p.submitEquation("2 + 3 + 5");
    expect(wrongValue).toEqual({ ok: false, reason: expect.stringMatching(/10.*16/) });
    const wrongDice = p.submitEquation("7 + 4 + 5");
    expect(wrongDice.ok).toBe(false);
    expect(p.submitEquation("2 + 3").ok).toBe(false); // uses two dice
    expect(p.playerKnocked).toHaveLength(0);
    expect(p.playerScore).toBe(0);
    expect(p.lastRefusal).toMatch(/.+/);

    expect(p.submitEquation("2^3 + 3 + 5")).toEqual({ ok: true, cellIndex: 1 });
    expect(p.playerScore).toBe(16);
    expect(p.playerKnocked[0]!.equation).not.toBeNull();
    expect(p.lastRefusal).toBeNull();

    // With no cell targeted the equation's value picks the cell (24 → index 2).
    expect(p.submitEquation("2^3 * 3 * 5^0")).toEqual({ ok: true, cellIndex: 2 });
    // 11 is not on a ×8 board.
    expect(p.submitEquation("2 * 3 + 5").ok).toBe(false);
    expect(p.playerScore).toBe(40);
    p.dispose();
  });
});

describe("PlayStore — a stale aim does not block a legal knock", () => {
  it("knocks the open cell the equation hits, even when another cell is aimed at", () => {
    const p = new PlayStore();
    p.start({ board: PATTERN_8, playerDice: [2, 3, 5] });
    p.selectCell(1); // aimed at 16
    expect(p.submitEquation("2^3 * 3 * 5^0")).toEqual({ ok: true, cellIndex: 2 }); // 24
    expect(p.targetIndex).toBeNull();
    // A total that hits no open cell still refuses against the aim.
    p.selectCell(1);
    expect(p.submitEquation("2 + 3 + 5").ok).toBe(false);
    p.dispose();
  });
});

describe("PlayStore — clear bonus", () => {
  function clearedAt(lastMs: number): SharedRace {
    return {
      v: 1,
      board: PATTERN_8,
      dice: [2, 3, 5],
      botDice: [2, 3, 5],
      durationMs: 60_000,
      botName: "Euler",
      difficulty: "standard",
      rules: "standard",
      botReachable: 0,
      player: PATTERN_8.map((v, i) => ({ i, v, t: Math.round((lastMs * (i + 1)) / 36) })),
      bot: [],
    };
  }

  it("keeps a full clear in scale with the board (the 36-cell example)", () => {
    const p = new PlayStore();
    // Board worth 5,328 cleared at 5.3 s used to score 60,317.
    expect(p.applyRaceSnapshot(clearedAt(5_300))).toBe(true);
    expect(p.playerScore).toBe(7_757);
    // A clear at the buzzer earns exactly the board.
    p.applyRaceSnapshot(clearedAt(60_000));
    expect(p.playerScore).toBe(5_328);
  });
});

describe("PlayStore — Easy bot on a fake clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("knocks cells during a 60 s race on a roll where it used to knock none", () => {
    vi.useFakeTimers();
    const p = new PlayStore();
    p.setSetup({ difficulty: "easy" });
    p.start({ board: PATTERN_8, playerDice: [20, 10, 16], silent: true });
    vi.advanceTimersByTime(60_000);
    expect(p.status).toBe("finished");
    expect(p.botKnocked.length).toBeGreaterThan(0);
    p.dispose();
  });
});

describe("PlayStore — leaving Play mid-race", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Back, Forward and the nav all route through AppStore's view change.
  it("pauses the race, refuses knocks while away, and resumes the clock where it stopped", () => {
    vi.useFakeTimers();
    const app = new AppStore();
    app.setView("play");
    const p = app.play;
    p.start({ board: PATTERN_8, playerDice: [2, 3, 5], silent: true });
    vi.advanceTimersByTime(5_000);
    app.setView("lookup");
    expect(p.status).toBe("paused");

    vi.advanceTimersByTime(20_000);
    expect(p.submitEquation("2^3 + 3 + 5").ok).toBe(false);
    expect(p.playerKnocked).toHaveLength(0);
    expect(p.elapsedMs).toBe(5_000);

    app.setView("play");
    p.resume();
    vi.advanceTimersByTime(1_000);
    expect(p.elapsedMs).toBe(6_000);
    expect(p.submitEquation("2^3 + 3 + 5").ok).toBe(true);
    app.dispose();
  });
});

describe("PlayStore — leaving Play during a replay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the replay where it was, so you come back to the same frame", () => {
    vi.useFakeTimers();
    const app = new AppStore();
    app.setView("play");
    const p = app.play;
    p.start({ board: PATTERN_8, playerDice: [2, 3, 5], silent: true });
    vi.advanceTimersByTime(60_000);
    expect(p.status).toBe("finished");
    p.togglePlayReplay();
    vi.advanceTimersByTime(2_000);
    const frame = p.replayMs;
    app.setView("lookup");
    vi.advanceTimersByTime(5_000);
    expect(p.replayMs).toBe(frame);
    expect(p.replayPlaying).toBe(false);
    app.dispose();
  });
});

describe("PlayStore — a match taking over Play", () => {
  it("pauses the Quick Race it replaces", () => {
    const app = new AppStore();
    app.setView("play");
    app.play.start({ board: PATTERN_8, playerDice: [2, 3, 5], silent: true });
    app.setMatch(new MatchStore());
    expect(app.play.status).toBe("paused");
    app.dispose();
  });
});

describe("PlayStore — typed refusals name the real problem", () => {
  it("checks the dice before the board, counts dice per mode, and clears on a new aim", () => {
    const p = new PlayStore();
    p.start({ board: PATTERN_8, playerDice: [2, 3, 5], silent: true });

    const wrongDice = p.submitEquation("1+1+1");
    expect(wrongDice.ok).toBe(false);
    expect(p.lastRefusal).toMatch(/roll 2, 3, 5/);
    expect(p.lastRefusal).not.toMatch(/board/);

    p.submitEquation("2+3");
    expect(p.lastRefusal).toMatch(/2 dice.*3/);
    expect(p.lastRefusal).not.toMatch(/3\.\.5/);

    p.selectCell(1);
    expect(p.lastRefusal).toBeNull();
    p.dispose();
  });
});
