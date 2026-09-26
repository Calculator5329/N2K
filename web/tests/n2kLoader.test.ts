/**
 * `N2kLoader.loadIndex` feeds the masthead date in every edition
 * (Receipt, Spreadsheet, Polaroid, Manuscript, ...). The blob header has
 * no timestamp, so the date comes from the build (see `vite.config.ts`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { N2kLoader } from "../src/services/n2kLoader";

const here = path.dirname(fileURLToPath(import.meta.url));
const blob = readFileSync(path.resolve(here, "../public/data/standard.n2k"));

function stubFetch(): void {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () =>
      blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength),
  }));
}

describe("N2kLoader.loadIndex generatedAt", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the dataset date it was built with", async () => {
    stubFetch();
    const loader = new N2kLoader("standard.n2k", "2026-04-20T06:02:44.000Z");
    const index = await loader.loadIndex();
    expect(index.generatedAt).toBe("2026-04-20T06:02:44.000Z");
  });

  it("never reports the Unix epoch when no date is injected", async () => {
    stubFetch();
    const index = await new N2kLoader("standard.n2k").loadIndex();
    expect(index.generatedAt.slice(0, 10)).not.toBe("1970-01-01");
  });
});
