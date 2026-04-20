/**
 * `competitionLibrary` — service-layer round-trip + summary derivation.
 *
 * Anchors v3.2's named-saves contract: list/save/load/rename/duplicate/
 * remove all stay inside the `compose:saved:{uuid}` namespace and ignore
 * stray ids (the working draft, stats docs, in-flight match state).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LocalStorageContentBackend,
  type ContentDoc,
} from "../src/services/contentBackend";
import {
  CompetitionLibrary,
  isSavedId,
  newSavedId,
} from "../src/services/competitionLibrary";
import type { SharedPlanV5 } from "../src/features/compose/CompositionStore";

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

function fixturePlan(name: string, opts?: { generated?: boolean }): SharedPlanV5 {
  const generated = opts?.generated ?? false;
  return {
    version: 5,
    name,
    pool: "standard",
    timeBudget: 250,
    seed: "test-seed",
    rules: "standard",
    spice: 6,
    variance: "balanced",
    phases: [
      {
        id: "p1",
        name: "Phase 1",
        boards: [
          {
            id: "b1",
            kind: "random",
            rangeMin: 1,
            rangeMax: 100,
            bouts: 3,
            overrides: {},
            ...(generated
              ? {
                  preview: Array.from({ length: 36 }, (_, i) => i + 1),
                  result: {
                    seed: "test-seed",
                    cells: Array.from({ length: 36 }, (_, i) => i + 1),
                    bouts: [],
                  },
                }
              : {}),
          },
        ],
      },
    ],
  } as unknown as SharedPlanV5;
}

describe("competitionLibrary", () => {
  let backend: LocalStorageContentBackend;
  let lib: CompetitionLibrary;

  beforeEach(() => {
    backend = new LocalStorageContentBackend(makeStorage());
    lib = new CompetitionLibrary(backend);
  });

  it("newSavedId mints a value that passes isSavedId", () => {
    const id = newSavedId();
    expect(isSavedId(id)).toBe(true);
    expect(isSavedId("compose:current")).toBe(false);
    expect(isSavedId("stats:abc")).toBe(false);
  });

  it("save + load round-trips a v5 plan", async () => {
    const id = newSavedId();
    const plan = fixturePlan("My Comp");
    await lib.save(id, plan);
    const loaded = await lib.load(id);
    expect(loaded?.body).toMatchObject({ version: 5, name: "My Comp" });
  });

  it("list ignores non-library ids and returns summaries", async () => {
    // Drop a stats doc + the working draft into the same backend.
    await backend.save({
      id: "compose:current",
      body: fixturePlan("Draft"),
      updatedAt: new Date().toISOString(),
      schemaVersion: 5,
    } satisfies ContentDoc<SharedPlanV5>);
    await backend.save({
      id: "stats:abc",
      body: { version: 1, compId: "abc", matches: [] },
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    });

    const a = newSavedId();
    const b = newSavedId();
    await lib.save(a, fixturePlan("Alpha"));
    await lib.save(b, fixturePlan("Beta", { generated: true }));

    const entries = await lib.list();
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(["Alpha", "Beta"]);
    const beta = entries.find((e) => e.name === "Beta")!;
    expect(beta.isGenerated).toBe(true);
    expect(beta.boutCount).toBe(3);
    expect(beta.phaseCount).toBe(1);
    // The generated fixture sets a 36-cell preview on the first board;
    // ungenerated entries fall back to an empty cell list.
    expect(beta.firstBoardCells.length).toBe(36);
    const alpha = entries.find((e) => e.name === "Alpha")!;
    expect(alpha.firstBoardCells.length).toBe(0);
  });

  it("rename writes back through the backend", async () => {
    const id = newSavedId();
    await lib.save(id, fixturePlan("Old name"));
    expect(await lib.rename(id, "New name")).toBe(true);
    const loaded = await lib.load(id);
    expect((loaded?.body as SharedPlanV5).name).toBe("New name");
  });

  it("rename refuses empty names + missing ids", async () => {
    expect(await lib.rename("compose:saved:missing", "x")).toBe(false);
    const id = newSavedId();
    await lib.save(id, fixturePlan("Hello"));
    expect(await lib.rename(id, "   ")).toBe(false);
  });

  it("duplicate clones the body under a new id with a (copy) suffix", async () => {
    const id = newSavedId();
    await lib.save(id, fixturePlan("Tournament"));
    const copyId = await lib.duplicate(id);
    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe(id);
    const copy = await lib.load(copyId!);
    expect((copy?.body as SharedPlanV5).name).toBe("Tournament (copy)");
  });

  it("remove deletes only saved ids", async () => {
    const id = newSavedId();
    await lib.save(id, fixturePlan("Doomed"));
    await lib.remove(id);
    expect(await lib.load(id)).toBeNull();

    // No-op for non-saved ids.
    await backend.save({
      id: "compose:current",
      body: fixturePlan("Draft"),
      updatedAt: new Date().toISOString(),
      schemaVersion: 5,
    } satisfies ContentDoc<SharedPlanV5>);
    await lib.remove("compose:current");
    expect(await backend.load("compose:current")).not.toBeNull();
  });
});
