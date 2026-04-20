/**
 * CompositionStore — v3.1+ Compose surface state.
 *
 * Covers the rules toggle (G), spice knob (H), and the v3.2 phase
 * tree + named-Library reframe. The async `generateAll`
 * path that touches the `.n2k` blob isn't exercised here — it requires
 * a network-shaped fixture that the existing `n2kLoader` plumbing can
 * read, and the integration coverage already lives in
 * `tests/n2kBlob.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  CompositionStore,
  SPICE_PRESETS,
  type SharedPlanV3,
  type SharedPlanV5,
} from "../src/features/compose/CompositionStore";
import { DataStore } from "../src/stores/DataStore";
import {
  LocalStorageContentBackend,
  type ContentBackend,
  type ContentDoc,
} from "../src/services/contentBackend";

function makeStore(content?: ContentBackend): CompositionStore {
  // DataStore is only consulted from `generateAll`, which we don't
  // call here. A bare instance is enough.
  return new CompositionStore(new DataStore(), content);
}

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe("CompositionStore — rules toggle (G)", () => {
  it("defaults to standard rules + standard pool", () => {
    const s = makeStore();
    expect(s.rules).toBe("standard");
    expect(s.candidatePool).toBe("standard");
  });

  it("flipping to aether swaps the candidate pool", () => {
    const s = makeStore();
    s.setRules("aether");
    expect(s.rules).toBe("aether");
    expect(s.candidatePool).toBe("aetherSample");
  });

  it("flipping back to standard restores a standard-compatible pool", () => {
    const s = makeStore();
    s.setRules("aether");
    s.setRules("standard");
    expect(s.candidatePool).toBe("standard");
  });

  it("invalidates any prior board results when rules change", () => {
    const s = makeStore();
    s.boards[0]!.status = "ready";
    s.boards[0]!.result = {
      rounds: [],
      p1TotalDifficulty: 0,
      p2TotalDifficulty: 0,
      difficultyDelta: 0,
      p1TotalExpectedScore: 0,
      p2TotalExpectedScore: 0,
      expectedScoreDelta: 0,
    };
    s.setRules("aether");
    expect(s.boards[0]!.status).toBe("idle");
    expect(s.boards[0]!.result).toBeNull();
  });

  it("exposes per-rules cell bounds (1..999 standard, 1..4999 aether)", () => {
    const s = makeStore();
    expect(s.cellBounds).toEqual({ min: 1, max: 999 });
    s.setRules("aether");
    expect(s.cellBounds).toEqual({ min: 1, max: 4999 });
    s.setRules("standard");
    expect(s.cellBounds).toEqual({ min: 1, max: 999 });
  });

  it("clamps board ranges down when toggling Æther → Standard", () => {
    const s = makeStore();
    s.setRules("aether");
    s.updateBoard(s.boards[0]!.id, { rangeMin: 100, rangeMax: 4500 });
    expect(s.boards[0]!.rangeMax).toBe(4500);
    s.setRules("standard");
    // 4500 must snap to the standard 999 ceiling; min stays as-is.
    expect(s.boards[0]!.rangeMax).toBe(999);
    expect(s.boards[0]!.rangeMin).toBe(100);
  });

  it("clamps per-cell pin overrides when toggling Æther → Standard", () => {
    const s = makeStore();
    s.setRules("aether");
    s.setOverride(s.boards[0]!.id, 0, 3000);
    s.setOverride(s.boards[0]!.id, 1, 42);
    s.setRules("standard");
    expect(s.boards[0]!.overrides.get(0)).toBe(999);
    expect(s.boards[0]!.overrides.get(1)).toBe(42);
  });
});

describe("CompositionStore — spice knob (H)", () => {
  it("defaults to spicy (full stratification)", () => {
    const s = makeStore();
    expect(s.spice).toBe("spicy");
  });

  it("setSpice persists to snapshot as the matching numeric value", () => {
    const s = makeStore();
    for (const preset of SPICE_PRESETS) {
      s.setSpice(preset.id);
      const snap = s.snapshot();
      expect(snap.spice).toBe(preset.value);
    }
  });

  it("applySnapshot snaps a numeric spice back to the nearest preset id", () => {
    const s = makeStore();
    // Hand-build a V3 envelope (`boards`, not `phases`) — the snapshot
    // shape changed to V5 in v3.2 but `applySnapshot` still accepts
    // older versions through the back-compat decoders, and that's the
    // path this test exercises.
    const v5 = s.snapshot();
    const plan: SharedPlanV3 = {
      version: 3,
      pool: v5.pool,
      timeBudget: v5.timeBudget,
      seed: v5.seed,
      rules: v5.rules,
      spice: 0.55, // closest preset is `balanced` (0.5).
      boards: v5.phases.flatMap((p) =>
        p.boards.map(({ bouts, ...rest }) => ({ ...rest, rounds: bouts })),
      ),
    };
    s.applySnapshot(plan);
    expect(s.spice).toBe("balanced");
  });
});

describe("CompositionStore — snapshot back-compat", () => {
  it("v1 snapshots decode with default rules (standard) + spice (spicy)", () => {
    const s = makeStore();
    s.applySnapshot({
      version: 1,
      pool: "standard",
      timeBudget: 60,
      seed: "deadbeef",
      boards: [
        {
          kind: "random",
          rangeMin: 1,
          rangeMax: 200,
          multiples: [6],
          patternStart: 6,
          rounds: 4,
          overrides: [],
        },
      ],
    });
    expect(s.rules).toBe("standard");
    expect(s.spice).toBe("spicy");
    expect(s.seed).toBe("deadbeef");
  });

  it("v1..v4 snapshots are migrated into a single 'Phase 1' wrapper", () => {
    const s = makeStore();
    s.applySnapshot({
      version: 1,
      pool: "standard",
      timeBudget: 60,
      seed: "abc",
      boards: [
        {
          kind: "random",
          rangeMin: 1,
          rangeMax: 200,
          multiples: [6],
          patternStart: 6,
          rounds: 5,
          overrides: [],
        },
        {
          kind: "pattern",
          rangeMin: 1,
          rangeMax: 999,
          multiples: [6],
          patternStart: 6,
          rounds: 3,
          overrides: [],
        },
      ],
    });
    expect(s.phases).toHaveLength(1);
    expect(s.phases[0]!.name).toBe("Phase 1");
    expect(s.phases[0]!.boards).toHaveLength(2);
    // `rounds → bouts` migration.
    expect(s.phases[0]!.boards[0]!.bouts).toBe(5);
    expect(s.phases[0]!.boards[1]!.bouts).toBe(3);
    // `boards` getter is a back-compat alias for current phase boards.
    expect(s.boards).toBe(s.phases[0]!.boards);
  });

  it("v5 snapshots round-trip with phases + name preserved", () => {
    const s = makeStore();
    s.setName("My Tournament");
    s.addPhase("Final");
    const snap: SharedPlanV5 = s.snapshot();
    expect(snap.version).toBe(5);
    expect(snap.name).toBe("My Tournament");
    expect(snap.phases).toHaveLength(2);
    const fresh = makeStore();
    fresh.applySnapshot(snap);
    expect(fresh.name).toBe("My Tournament");
    expect(fresh.phases).toHaveLength(2);
    expect(fresh.phases[1]!.name).toBe("Final");
  });
});

describe("CompositionStore — phase CRUD", () => {
  it("seeds with one phase containing the default boards", () => {
    const s = makeStore();
    expect(s.phases).toHaveLength(1);
    expect(s.phases[0]!.name).toBe("Phase 1");
    expect(s.phases[0]!.boards).toHaveLength(2);
  });

  it("addPhase auto-numbers and switches the cursor to the new phase", () => {
    const s = makeStore();
    const id = s.addPhase();
    expect(s.phases).toHaveLength(2);
    expect(s.phases[1]!.name).toBe("Phase 2");
    expect(s.currentPhaseId).toBe(id);
  });

  it("removePhase refuses to delete the last remaining phase", () => {
    const s = makeStore();
    s.removePhase(s.phases[0]!.id);
    expect(s.phases).toHaveLength(1);
  });

  it("renamePhase ignores empty names", () => {
    const s = makeStore();
    const id = s.phases[0]!.id;
    s.renamePhase(id, "Quarterfinals");
    expect(s.phases[0]!.name).toBe("Quarterfinals");
    s.renamePhase(id, "   ");
    expect(s.phases[0]!.name).toBe("Quarterfinals");
  });

  it("reorderPhase repositions phases without touching the cursor id", () => {
    const s = makeStore();
    const second = s.addPhase("B");
    const third = s.addPhase("C");
    s.reorderPhase(third, 0);
    expect(s.phases.map((p) => p.id)).toEqual([third, s.phases[1]!.id, second]);
  });

  it("addBoard scopes to the current phase", () => {
    const s = makeStore();
    const phase2 = s.addPhase();
    s.setCurrentPhase(phase2);
    s.addBoard({ kind: "random", rangeMin: 1, rangeMax: 99 });
    expect(s.phases[0]!.boards).toHaveLength(2);
    expect(s.phases[1]!.boards).toHaveLength(1);
  });

  it("allBoards enumerates across phases", () => {
    const s = makeStore();
    s.addPhase("B");
    s.addBoard();
    expect(s.allBoards.length).toBe(3);
  });
});

describe("CompositionStore — autosave routing", () => {
  it("writes to compose:current by default", async () => {
    const storage = new MemoryStorage();
    const backend = new LocalStorageContentBackend(storage);
    const s = makeStore(backend);
    const detach = s.attachAutosave();
    s.setName("Drafted");
    // Allow autorun microtask to flush.
    await Promise.resolve();
    const doc = await backend.load<SharedPlanV5>(CompositionStore.DRAFT_DOC_ID);
    expect(doc).not.toBeNull();
    expect(doc!.body.name).toBe("Drafted");
    detach();
  });

  it("attachToLibrary retargets autosave to the saved id", async () => {
    const storage = new MemoryStorage();
    const backend = new LocalStorageContentBackend(storage);
    const s = makeStore(backend);
    const detach = s.attachAutosave();
    const savedId = `${CompositionStore.SAVED_DOC_PREFIX}abc123`;
    s.attachToLibrary(savedId);
    s.setName("Named Comp");
    await Promise.resolve();
    const doc = (await backend.load<SharedPlanV5>(savedId)) as ContentDoc<SharedPlanV5>;
    expect(doc).not.toBeNull();
    expect(doc.body.name).toBe("Named Comp");
    detach();
  });
});
