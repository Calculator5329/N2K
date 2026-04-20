/**
 * LocalStorageContentBackend — round-trip persistence.
 *
 * Anchors Phase F's autosave contract. Uses an in-memory `Storage`
 * shim so the test stays deterministic across happy-dom upgrades.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LocalStorageContentBackend,
  type ContentDoc,
} from "../src/services/contentBackend";

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

describe("LocalStorageContentBackend", () => {
  let storage: Storage;
  let backend: LocalStorageContentBackend;

  beforeEach(() => {
    storage = makeStorage();
    backend = new LocalStorageContentBackend(storage);
  });

  it("returns null for unknown ids", async () => {
    expect(await backend.load("missing")).toBeNull();
  });

  it("round-trips a document", async () => {
    const doc: ContentDoc<{ x: number }> = {
      id: "test",
      body: { x: 42 },
      updatedAt: "2025-01-01T00:00:00.000Z",
      schemaVersion: 1,
    };
    await backend.save(doc);
    const loaded = await backend.load<{ x: number }>("test");
    expect(loaded).toEqual(doc);
  });

  it("overwrites on save", async () => {
    await backend.save({ id: "x", body: 1, updatedAt: "a", schemaVersion: 1 });
    await backend.save({ id: "x", body: 2, updatedAt: "b", schemaVersion: 1 });
    const loaded = await backend.load<number>("x");
    expect(loaded?.body).toBe(2);
  });

  it("lists only namespaced keys", async () => {
    await backend.save({ id: "a", body: 0, updatedAt: "t", schemaVersion: 1 });
    await backend.save({ id: "b", body: 0, updatedAt: "t", schemaVersion: 1 });
    storage.setItem("unrelated", "{}");
    const ids = [...(await backend.list())].sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("removes by id", async () => {
    await backend.save({ id: "x", body: 0, updatedAt: "t", schemaVersion: 1 });
    await backend.remove("x");
    expect(await backend.load("x")).toBeNull();
  });

  it("survives garbled JSON", async () => {
    storage.setItem("n2k:content:bad", "{not-json");
    expect(await backend.load("bad")).toBeNull();
  });
});
