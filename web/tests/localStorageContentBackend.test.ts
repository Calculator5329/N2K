import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageContentBackend } from "../src/services/local/localStorageContentBackend.js";

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
  size(): number {
    return this.data.size;
  }
}

describe("LocalStorageContentBackend", () => {
  let storage: MemoryStorage;
  let backend: LocalStorageContentBackend;

  beforeEach(() => {
    storage = new MemoryStorage();
    backend = new LocalStorageContentBackend(storage);
  });

  it("put / get round-trips an entity", async () => {
    const saved = await backend.put({
      id: "b1",
      kind: "board",
      ownerId: "alice",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      title: "First",
      body: { hello: "world" },
    });
    expect(saved.revision).toBe(1);
    const fetched = await backend.get<{ hello: string }>("board", "b1");
    expect(fetched?.body.hello).toBe("world");
  });

  it("survives a fresh backend instance over the same storage (persistence)", async () => {
    await backend.put({
      id: "p1",
      kind: "board",
      ownerId: "alice",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      title: "Persisted",
      body: 42,
    });
    const reborn = new LocalStorageContentBackend(storage);
    const list = await reborn.list<number>("board");
    expect(list.map((e) => e.title)).toEqual(["Persisted"]);
  });

  it("delete removes the entity and its index entry", async () => {
    await backend.put({
      id: "d1",
      kind: "board",
      ownerId: "alice",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      body: 1,
    });
    await backend.delete("board", "d1");
    expect(await backend.get("board", "d1")).toBeNull();
    expect(await backend.list("board")).toEqual([]);
  });

  it("list filters by ownerId and sorts newest-first by default", async () => {
    await backend.put({
      id: "a",
      kind: "board",
      ownerId: "alice",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      title: "alice-1",
      body: 0,
    });
    await new Promise((r) => setTimeout(r, 5));
    await backend.put({
      id: "b",
      kind: "board",
      ownerId: "bob",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      title: "bob-1",
      body: 0,
    });
    await new Promise((r) => setTimeout(r, 5));
    await backend.put({
      id: "c",
      kind: "board",
      ownerId: "alice",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      title: "alice-2",
      body: 0,
    });
    const aliceList = await backend.list("board", { ownerId: "alice" });
    expect(aliceList.map((e) => e.title)).toEqual(["alice-2", "alice-1"]);
  });

  it("subscribeKind fires on insert + delete in the same backend instance", async () => {
    const events: Array<string | null> = [];
    const off = backend.subscribeKind("board", (doc) => events.push(doc?.id ?? null));
    await backend.put({
      id: "x",
      kind: "board",
      ownerId: "u",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      body: 0,
    });
    await backend.delete("board", "x");
    off();
    expect(events).toEqual(["x", null]);
  });

  it("tolerates a corrupted index entry by skipping it", async () => {
    await backend.put({
      id: "ok",
      kind: "board",
      ownerId: "u",
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
      body: 1,
    });
    // Inject an id whose record never existed.
    storage.setItem("n2k.content.v1.index.board", JSON.stringify(["ok", "ghost"]));
    const list = await backend.list("board");
    expect(list.map((e) => e.id)).toEqual(["ok"]);
  });
});
