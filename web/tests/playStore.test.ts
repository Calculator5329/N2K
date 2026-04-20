/**
 * PlayStore — Æther rule toggle drives mode selection.
 *
 * The setup screen exposes a Standard/Æther rules tile; flipping it
 * should change which Mode the bot + hint solver see. Race lifecycle
 * smoke-coverage too — the timer plumbing is the riskiest bit and
 * we want to know early if it stops scheduling.
 */
import { describe, expect, it } from "vitest";
import { PlayStore } from "../src/stores/PlayStore";
import { STANDARD_MODE, AETHER_MODE } from "../../src/core/constants";

describe("PlayStore", () => {
  it("defaults to standard rules + standard mode", () => {
    const p = new PlayStore();
    expect(p.setup.rules).toBe("standard");
    expect(p.mode).toBe(STANDARD_MODE);
  });

  it("swaps mode when rules flip to aether", () => {
    const p = new PlayStore();
    p.setSetup({ rules: "aether" });
    expect(p.mode).toBe(AETHER_MODE);
  });

  it("setSetup({difficulty}) auto-renames the bot", () => {
    const p = new PlayStore();
    p.setSetup({ difficulty: "master" });
    expect(p.setup.botName).toBe("Ramanujan");
  });

  it("starts a race and rolls dice within mode bounds", () => {
    const p = new PlayStore();
    p.start();
    expect(p.status).toBe("racing");
    expect(p.dice.length).toBe(3);
    for (const d of p.dice) {
      expect(d).toBeGreaterThanOrEqual(p.mode.diceRange.min);
      expect(d).toBeLessThanOrEqual(p.mode.diceRange.max);
    }
    p.dispose();
  });

  it("defaults raceDurationMs to 60s and remainingMs counts down from there", () => {
    const p = new PlayStore();
    p.start();
    expect(p.raceDurationMs).toBe(60_000);
    expect(p.remainingMs).toBe(60_000);
    p.dispose();
  });

  it("honors RaceOverrides.raceDurationMs (e.g. a 30s comp)", () => {
    const p = new PlayStore();
    p.start({ raceDurationMs: 30_000 });
    expect(p.raceDurationMs).toBe(30_000);
    expect(p.remainingMs).toBe(30_000);
    p.dispose();
  });

  it("falls back to the default when raceDurationMs is omitted or zero", () => {
    const p = new PlayStore();
    p.start({ raceDurationMs: 0 });
    expect(p.raceDurationMs).toBe(60_000);
    p.dispose();
  });
});

/**
 * Replay (#C in the v3.1+ next-features) is a derived view over the
 * race log — these tests cover the key invariants without spinning a
 * full real-time race:
 *   - `enterReplay` is a no-op until the race finishes.
 *   - The replay-aware accessors filter `playerKnocked` / `botKnocked`
 *     by the cursor.
 *   - Step navigation snaps to events in the merged timeline.
 */
describe("PlayStore — replay", () => {
  function fakeFinishedRace(): PlayStore {
    const p = new PlayStore();
    p.start();
    // Stamp deterministic knocks at known timestamps.
    (p as unknown as { playerKnocked: unknown }).playerKnocked = [
      { cellIndex: 0, cellValue: 1, equation: null, atMs: 5_000 },
      { cellIndex: 1, cellValue: 2, equation: null, atMs: 20_000 },
      { cellIndex: 2, cellValue: 3, equation: null, atMs: 45_000 },
    ];
    (p as unknown as { botKnocked: unknown }).botKnocked = [
      { cellIndex: 10, cellValue: 11, equation: null, atMs: 10_000 },
      { cellIndex: 11, cellValue: 12, equation: null, atMs: 30_000 },
    ];
    (p as unknown as { status: string }).status = "finished";
    (p as unknown as { elapsedMs: number }).elapsedMs = 60_000;
    p.dispose();
    return p;
  }

  it("ignores enterReplay when the race hasn't finished", () => {
    const p = new PlayStore();
    p.enterReplay();
    expect(p.replayActive).toBe(false);
    p.dispose();
  });

  it("filters knocks by the replay cursor", () => {
    const p = fakeFinishedRace();
    p.enterReplay();
    expect(p.replayActive).toBe(true);
    p.setReplayMs(15_000);
    expect(p.currentPlayerKnocked.length).toBe(1);
    expect(p.currentBotKnocked.length).toBe(1);
    p.setReplayMs(40_000);
    expect(p.currentPlayerKnocked.length).toBe(2);
    expect(p.currentBotKnocked.length).toBe(2);
  });

  it("step → / step ← walk the merged timeline", () => {
    const p = fakeFinishedRace();
    p.enterReplay();
    expect(p.replayMs).toBe(0);
    p.stepReplay(1);
    expect(p.replayMs).toBe(5_000); // first player knock
    p.stepReplay(1);
    expect(p.replayMs).toBe(10_000); // first bot knock
    p.stepReplay(-1);
    expect(p.replayMs).toBe(5_000);
  });

  it("clamps the cursor inside [0, race duration]", () => {
    const p = fakeFinishedRace();
    p.enterReplay();
    p.setReplayMs(-1000);
    expect(p.replayMs).toBe(0);
    p.setReplayMs(99_999);
    expect(p.replayMs).toBe(60_000);
  });

  it("exit returns to the live state", () => {
    const p = fakeFinishedRace();
    p.enterReplay();
    p.setReplayMs(15_000);
    expect(p.currentPlayerKnocked.length).toBe(1);
    p.exitReplay();
    expect(p.replayActive).toBe(false);
    expect(p.currentPlayerKnocked.length).toBe(3);
  });
});
