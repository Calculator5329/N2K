/**
 * PlayStore — shareable race results.
 *
 * A finished race round-trips through the URL hash via the same versioned
 * `compressedHashCodec` the Compose plan links use. These tests cover the
 * three things that matter: (1) the snapshot/apply pair is lossless, (2)
 * the real codec round-trips it, and (3) malformed / forward-versioned
 * payloads degrade to "no shared race" instead of throwing or corrupting
 * the store.
 */
import { describe, expect, it } from "vitest";
import { PlayStore, type SharedRace } from "../src/stores/PlayStore";
import {
  decodeShareable,
  encodeShareable,
} from "../src/services/compressedHashCodec";

function sampleRace(): SharedRace {
  return {
    v: 1,
    board: Array.from({ length: 36 }, (_, i) => (i + 1) * 8),
    dice: [8, 3, 5],
    botDice: [8, 3, 5],
    durationMs: 60_000,
    botName: "Euler",
    difficulty: "standard",
    rules: "standard",
    botReachable: 12,
    player: [
      { i: 0, v: 8, t: 1200 },
      { i: 1, v: 16, t: 3400 },
    ],
    bot: [
      { i: 0, v: 8, t: 900, e: { dice: [8, 3, 5], exps: [1, 1, 1], ops: [1, 2], total: 8 } },
      { i: 2, v: 24, t: 4200, e: null },
    ],
  };
}

describe("PlayStore — shareable race results", () => {
  it("raceSnapshot() is null until a race has finished", () => {
    const p = new PlayStore();
    expect(p.raceSnapshot()).toBeNull();
    p.start();
    expect(p.raceSnapshot()).toBeNull();
    p.dispose();
  });

  it("applyRaceSnapshot then raceSnapshot round-trips losslessly", () => {
    const p = new PlayStore();
    const race = sampleRace();
    expect(p.applyRaceSnapshot(race)).toBe(true);

    // Store lands on the finished results screen with the race restored.
    expect(p.status).toBe("finished");
    expect(p.boardCells).toEqual(race.board);
    expect(p.dice).toEqual(race.dice);
    expect(p.setup.botName).toBe("Euler");
    expect(p.playerKnocked.map((c) => c.cellIndex)).toEqual([0, 1]);
    expect(p.botKnocked[0]!.equation).toEqual(race.bot[0]!.e);
    expect(p.botKnocked[1]!.equation).toBeNull();
    // Scores are recomputed from the restored knock log.
    expect(p.playerScore).toBe(24);
    expect(p.botScore).toBe(32);
    // The replay scrubber has a merged, sorted timeline to step through.
    expect(p.replayTimeline.map((e) => e.atMs)).toEqual([900, 1200, 3400, 4200]);

    expect(p.raceSnapshot()).toEqual(race);
    p.dispose();
  });

  it("survives the compressedHashCodec encode → decode round-trip", async () => {
    const race = sampleRace();
    const encoded = await encodeShareable(race);
    expect(encoded.startsWith("v1.")).toBe(true);

    const decoded = await decodeShareable<unknown>(encoded);
    expect(decoded).toEqual(race);

    const p = new PlayStore();
    expect(p.applyRaceSnapshot(decoded)).toBe(true);
    expect(p.raceSnapshot()).toEqual(race);
    p.dispose();
  });

  it("buildRaceShareUrl → loadRaceFromUrl restores through window.location", async () => {
    window.location.hash = "";
    const sender = new PlayStore();
    sender.applyRaceSnapshot(sampleRace());
    const url = await sender.buildRaceShareUrl();
    expect(url).toContain("race=");

    const recipient = new PlayStore();
    expect(await recipient.loadRaceFromUrl()).toBe(true);
    expect(recipient.status).toBe("finished");
    expect(recipient.raceSnapshot()).toEqual(sampleRace());
    // One-shot: the hash is cleared after a successful restore.
    expect(await recipient.loadRaceFromUrl()).toBe(false);

    sender.dispose();
    recipient.dispose();
  });

  it("buildRaceShareUrl is empty when there's no finished race", async () => {
    window.location.hash = "";
    const p = new PlayStore();
    expect(await p.buildRaceShareUrl()).toBe("");
    p.dispose();
  });

  it("rejects malformed payloads without mutating the store", () => {
    const p = new PlayStore();
    const before = p.status;
    const bad: unknown[] = [
      null,
      undefined,
      42,
      "not-an-object",
      {},
      { ...sampleRace(), v: 2 }, // forward version
      { ...sampleRace(), board: [1, 2, 3] }, // wrong board length
      { ...sampleRace(), dice: ["x"] }, // non-numeric dice
      { ...sampleRace(), durationMs: 0 }, // non-positive duration
      { ...sampleRace(), difficulty: "godlike" }, // unknown difficulty
      { ...sampleRace(), rules: "chaos" }, // unknown rules
      { ...sampleRace(), player: [{ i: 99, v: 8, t: 0 }] }, // index out of range
      { ...sampleRace(), player: [{ i: 0, t: 0 }] }, // missing value
      { ...sampleRace(), player: "nope" }, // knocks not an array
    ];
    for (const payload of bad) {
      expect(p.applyRaceSnapshot(payload)).toBe(false);
    }
    expect(p.status).toBe(before);
    expect(p.raceSnapshot()).toBeNull();
    p.dispose();
  });

  it("loadRaceFromUrl returns false for a garbage race hash", async () => {
    window.location.hash = "race=not-a-valid-payload";
    const p = new PlayStore();
    expect(await p.loadRaceFromUrl()).toBe(false);
    expect(p.status).toBe("setup");
    p.dispose();
    window.location.hash = "";
  });
});
