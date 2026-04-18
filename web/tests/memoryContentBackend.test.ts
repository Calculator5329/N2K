import { describe, expect, it } from "vitest";
import { MemoryContentBackend } from "../src/services/local/memoryContentBackend.js";
import type { ContentEntity } from "../src/services/contentBackend.js";

function mkEntity(
  id: string,
  overrides: Partial<ContentEntity<{ note: string }>> = {},
): ContentEntity<{ note: string }> {
  const now = Date.now();
  return {
    id,
    kind: "board",
    ownerId: "owner-a",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    title: `entity ${id}`,
    body: { note: "hi" },
    ...overrides,
  };
}

describe("MemoryContentBackend", () => {
  it("returns null for missing entities", async () => {
    const b = new MemoryContentBackend();
    expect(await b.get("board", "nope")).toBeNull();
  });

  it("put assigns revision and updatedAt; preserves createdAt across updates", async () => {
    const b = new MemoryContentBackend();
    const created = await b.put(mkEntity("a", { revision: 99, createdAt: 1 }));
    expect(created.revision).toBe(1);
    expect(created.createdAt).toBe(1);

    await new Promise((r) => setTimeout(r, 2));
    const updated = await b.put(mkEntity("a", { body: { note: "edited" }, createdAt: 999 }));
    expect(updated.revision).toBe(2);
    expect(updated.createdAt).toBe(1); // preserved
    expect(updated.body.note).toBe("edited");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it("delete is idempotent", async () => {
    const b = new MemoryContentBackend();
    await b.put(mkEntity("a"));
    await b.delete("board", "a");
    await b.delete("board", "a"); // no throw
    expect(await b.get("board", "a")).toBeNull();
  });

  it("list filters by ownerId, sorts by updatedAt desc by default", async () => {
    const b = new MemoryContentBackend();
    await b.put(mkEntity("a", { ownerId: "x" }));
    await new Promise((r) => setTimeout(r, 2));
    await b.put(mkEntity("b", { ownerId: "y" }));
    await new Promise((r) => setTimeout(r, 2));
    await b.put(mkEntity("c", { ownerId: "x" }));

    const xs = await b.list("board", { ownerId: "x" });
    expect(xs.map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("list filters by tagsAny / tagsAll", async () => {
    const b = new MemoryContentBackend();
    await b.put(mkEntity("a", { tags: ["red", "fast"] }));
    await b.put(mkEntity("b", { tags: ["blue"] }));
    await b.put(mkEntity("c", { tags: ["red"] }));

    const any = await b.list("board", { tagsAny: ["red"] });
    expect(any.map((e) => e.id).sort()).toEqual(["a", "c"]);

    const all = await b.list("board", { tagsAll: ["red", "fast"] });
    expect(all.map((e) => e.id)).toEqual(["a"]);
  });

  it("subscribe fires on put + delete and stops after unsubscribe", async () => {
    const b = new MemoryContentBackend();
    const events: (string | null)[] = [];
    const off = b.subscribe<{ note: string }>("board", "a", (e) =>
      events.push(e === null ? null : e.body.note),
    );
    await b.put(mkEntity("a", { body: { note: "v1" } }));
    await b.put(mkEntity("a", { body: { note: "v2" } }));
    await b.delete("board", "a");
    expect(events).toEqual(["v1", "v2", null]);

    off();
    await b.put(mkEntity("a", { body: { note: "v3" } }));
    expect(events).toEqual(["v1", "v2", null]); // unchanged
  });

  it("subscribeKind fires for every entity in the kind", async () => {
    const b = new MemoryContentBackend();
    const events: string[] = [];
    b.subscribeKind<{ note: string }>("board", (e) => {
      if (e !== null) events.push(e.id);
    });
    await b.put(mkEntity("a"));
    await b.put(mkEntity("b"));
    expect(events).toEqual(["a", "b"]);
  });

  it("kinds are isolated", async () => {
    const b = new MemoryContentBackend();
    await b.put({ ...mkEntity("a"), kind: "board" });
    await b.put({ ...mkEntity("a"), kind: "competition" });
    expect((await b.get("board", "a"))!.kind).toBe("board");
    expect((await b.get("competition", "a"))!.kind).toBe("competition");
    await b.delete("board", "a");
    expect(await b.get("board", "a")).toBeNull();
    expect(await b.get("competition", "a")).not.toBeNull();
  });
});
