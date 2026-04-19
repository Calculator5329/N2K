import { describe, expect, it } from "vitest";
import {
  ContentBackendBoardLibrary,
  type BoardDocBody,
} from "../src/services/boardLibrary.js";
import { MemoryContentBackend } from "../src/services/local/memoryContentBackend.js";
import { BoardLibraryStore } from "../src/stores/BoardLibraryStore.js";

function sampleBody(overrides: Partial<BoardDocBody> = {}): BoardDocBody {
  return {
    modeId: "standard",
    kind: "random",
    random: { min: 1, max: 99 },
    pattern: { multiples: [6], start: 6 },
    rounds: 4,
    cells: Array.from({ length: 36 }, (_, i) => i + 1),
    pinned: [0, 7],
    ...overrides,
  };
}

describe("ContentBackendBoardLibrary", () => {
  it("save assigns an id and persists the body", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    const saved = await lib.save({
      title: "First",
      ownerId: "alice",
      body: sampleBody(),
    });
    expect(saved.id).toMatch(/^board-/);
    expect(saved.title).toBe("First");
    expect(saved.ownerId).toBe("alice");
    expect(saved.kind).toBe("board");
    expect(saved.body.cells).toHaveLength(36);
    expect(saved.revision).toBe(1);
  });

  it("save with the same id bumps the revision", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    const first = await lib.save({ title: "A", ownerId: "u", body: sampleBody() });
    const second = await lib.save({ id: first.id, title: "A2", ownerId: "u", body: sampleBody() });
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(2);
    expect(second.title).toBe("A2");
  });

  it("list returns owner-filtered, newest-first results", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    await lib.save({ title: "Alice 1", ownerId: "alice", body: sampleBody() });
    await new Promise((r) => setTimeout(r, 5));
    await lib.save({ title: "Bob 1", ownerId: "bob", body: sampleBody() });
    await new Promise((r) => setTimeout(r, 5));
    await lib.save({ title: "Alice 2", ownerId: "alice", body: sampleBody() });
    const aliceList = await lib.list({ ownerId: "alice" });
    expect(aliceList.map((d) => d.title)).toEqual(["Alice 2", "Alice 1"]);
  });

  it("remove is idempotent", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    const saved = await lib.save({ title: "X", ownerId: "u", body: sampleBody() });
    await lib.remove(saved.id);
    await lib.remove(saved.id);
    expect(await lib.get(saved.id)).toBeNull();
  });

  it("subscribe fires on insert + delete", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    const events: Array<string | null> = [];
    const off = lib.subscribe((doc) => events.push(doc?.id ?? null));
    const saved = await lib.save({ title: "Y", ownerId: "u", body: sampleBody() });
    await lib.remove(saved.id);
    off();
    expect(events).toEqual([saved.id, null]);
  });
});

describe("BoardLibraryStore", () => {
  it("loads existing entries on construction", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    await lib.save({ title: "Pre-existing", ownerId: "alice", body: sampleBody() });
    const store = new BoardLibraryStore({ service: lib, currentOwnerId: () => "alice" });
    // refresh kicks off in the constructor; await a microtask for it.
    await new Promise((r) => setTimeout(r, 10));
    expect(store.entries.map((e) => e.title)).toEqual(["Pre-existing"]);
    store.dispose();
  });

  it("save → entries reflects the new doc", async () => {
    const store = new BoardLibraryStore({
      service: new ContentBackendBoardLibrary(new MemoryContentBackend()),
      currentOwnerId: () => "alice",
    });
    await new Promise((r) => setTimeout(r, 5));
    const saved = await store.save("Hello", sampleBody());
    expect(saved).not.toBeNull();
    expect(store.entries.map((e) => e.title)).toContain("Hello");
    store.dispose();
  });

  it("remove drops the entry", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    const store = new BoardLibraryStore({ service: lib, currentOwnerId: () => "alice" });
    const saved = await store.save("Tmp", sampleBody());
    await store.remove(saved!.id);
    expect(store.entries.map((e) => e.id)).not.toContain(saved!.id);
    store.dispose();
  });

  it("isolates entries by owner", async () => {
    const lib = new ContentBackendBoardLibrary(new MemoryContentBackend());
    let owner = "alice";
    const store = new BoardLibraryStore({ service: lib, currentOwnerId: () => owner });
    await store.save("Alice's", sampleBody());
    expect(store.entries.map((e) => e.title)).toEqual(["Alice's"]);
    owner = "bob";
    await store.refresh();
    expect(store.entries).toEqual([]);
    store.dispose();
  });
});
