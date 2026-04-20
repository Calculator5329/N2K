/**
 * `matchStats` — append + roll-up math for the Library card stats.
 *
 * Validates the bestAvgScore / winRate / lastPlayedAt derivation and
 * the per-comp namespace isolation (deleting one comp's history must
 * not touch another's).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageContentBackend } from "../src/services/contentBackend";
import {
  clearStatsFor,
  computeMatchStats,
  loadAllStats,
  loadStatsFor,
  recordMatch,
  type MatchRecord,
} from "../src/services/matchStats";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function makeRecord(opts: {
  compId: string;
  finishedAt: string;
  userTotal: number;
  oppTotal: number;
  outcome: "win" | "loss" | "tie";
  raceCount: number;
}): MatchRecord {
  return {
    compId: opts.compId,
    matchId: opts.compId + ":" + opts.finishedAt,
    format: "vs-bot",
    finishedAt: opts.finishedAt,
    bots: [{ seat: "P2", difficulty: "casual", name: "Tess" }],
    bouts: [],
    userTotalScore: opts.userTotal,
    opponentTotalScore: opts.oppTotal,
    userTotalsBySeat: null,
    outcome: opts.outcome,
    userRaceCount: opts.raceCount,
  };
}

describe("matchStats — pure roll-ups", () => {
  it("returns null roll-ups for an empty log", () => {
    const stats = computeMatchStats([]);
    expect(stats.lastPlayedAt).toBeNull();
    expect(stats.bestAvgScore).toBeNull();
    expect(stats.winRate).toBeNull();
  });

  it("picks the highest user avg per race across matches", () => {
    const records: MatchRecord[] = [
      makeRecord({ compId: "c1", finishedAt: "2026-01-01T00:00:00Z", userTotal: 30, oppTotal: 20, outcome: "win", raceCount: 5 }),  // 6.0
      makeRecord({ compId: "c1", finishedAt: "2026-01-02T00:00:00Z", userTotal: 12, oppTotal: 18, outcome: "loss", raceCount: 3 }), // 4.0
      makeRecord({ compId: "c1", finishedAt: "2026-01-03T00:00:00Z", userTotal: 49, oppTotal: 49, outcome: "tie", raceCount: 7 }),  // 7.0
    ];
    const stats = computeMatchStats(records);
    expect(stats.bestAvgScore).toBeCloseTo(7.0);
    expect(stats.lastPlayedAt).toBe("2026-01-03T00:00:00Z");
    // 1 win out of 2 decided matches (the tie is excluded from the denominator).
    expect(stats.winRate).toBeCloseTo(0.5);
  });

  it("ignores zero-race-count matches when computing best avg", () => {
    const records: MatchRecord[] = [
      makeRecord({ compId: "c1", finishedAt: "2026-01-01T00:00:00Z", userTotal: 0, oppTotal: 0, outcome: "tie", raceCount: 0 }),
      makeRecord({ compId: "c1", finishedAt: "2026-01-02T00:00:00Z", userTotal: 4, oppTotal: 2, outcome: "win", raceCount: 2 }),
    ];
    const stats = computeMatchStats(records);
    expect(stats.bestAvgScore).toBeCloseTo(2.0);
    expect(stats.winRate).toBeCloseTo(1.0); // tie excluded → 1/1.
  });
});

describe("matchStats — backend round-trip", () => {
  let backend: LocalStorageContentBackend;

  beforeEach(() => {
    backend = new LocalStorageContentBackend(makeStorage());
  });

  it("appends records under stats:{compId}", async () => {
    const r1 = makeRecord({ compId: "alpha", finishedAt: "2026-01-01T00:00:00Z", userTotal: 10, oppTotal: 5, outcome: "win", raceCount: 3 });
    const r2 = makeRecord({ compId: "alpha", finishedAt: "2026-01-02T00:00:00Z", userTotal: 4, oppTotal: 9, outcome: "loss", raceCount: 3 });
    await recordMatch(r1, backend);
    await recordMatch(r2, backend);
    const log = await loadStatsFor("alpha", backend);
    expect(log).toHaveLength(2);
    expect(log[0]!.userTotalScore).toBe(10);
    expect(log[1]!.outcome).toBe("loss");
  });

  it("loadAllStats builds the per-comp roll-up map", async () => {
    await recordMatch(makeRecord({ compId: "alpha", finishedAt: "2026-01-01T00:00:00Z", userTotal: 12, oppTotal: 6, outcome: "win", raceCount: 4 }), backend);
    await recordMatch(makeRecord({ compId: "beta", finishedAt: "2026-01-05T00:00:00Z", userTotal: 8, oppTotal: 10, outcome: "loss", raceCount: 2 }), backend);
    const all = await loadAllStats(backend);
    expect(all.size).toBe(2);
    expect(all.get("alpha")?.bestAvgScore).toBeCloseTo(3.0);
    expect(all.get("beta")?.bestAvgScore).toBeCloseTo(4.0);
  });

  it("clearStatsFor wipes one comp without touching siblings", async () => {
    await recordMatch(makeRecord({ compId: "alpha", finishedAt: "2026-01-01T00:00:00Z", userTotal: 12, oppTotal: 6, outcome: "win", raceCount: 4 }), backend);
    await recordMatch(makeRecord({ compId: "beta", finishedAt: "2026-01-05T00:00:00Z", userTotal: 8, oppTotal: 10, outcome: "loss", raceCount: 2 }), backend);
    await clearStatsFor("alpha", backend);
    expect(await loadStatsFor("alpha", backend)).toHaveLength(0);
    expect(await loadStatsFor("beta", backend)).toHaveLength(1);
  });
});
