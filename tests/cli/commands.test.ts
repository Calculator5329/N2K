import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli/commands/index.js";
import { defaultContext } from "../../src/cli/context.js";
import { parseArgs } from "../../src/cli/parseArgs.js";
import { stripAnsi } from "../../src/cli/ansi.js";

class CapturedStream extends Writable {
  chunks: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override _write(chunk: any, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    cb();
  }
  text(): string {
    return stripAnsi(this.chunks.join(""));
  }
}

function freshCtx() {
  return defaultContext(false);
}

async function run(verb: string, argv: readonly string[]) {
  const out = new CapturedStream();
  const ctx = freshCtx();
  const result = await COMMANDS[verb]!(parseArgs(argv), ctx, out);
  return { result, out, ctx };
}

describe("help command", () => {
  it("lists every command", async () => {
    const { result, out } = await run("help", []);
    expect(result.exitCode).toBe(0);
    const text = out.text();
    for (const verb of [
      "mode", "dice", "roll", "board", "solve", "solve-all",
      "sweep", "explain", "export", "help",
    ]) {
      expect(text).toContain(verb);
    }
  });

  it("shows per-command usage when given a verb", async () => {
    const { result, out } = await run("help", ["solve"]);
    expect(result.exitCode).toBe(0);
    expect(out.text()).toContain("usage: solve --target");
  });

  it("exits 1 for unknown verb", async () => {
    const { result, out } = await run("help", ["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toContain("unknown command");
  });
});

describe("mode command", () => {
  it("prints standard by default", async () => {
    const { result, out } = await run("mode", []);
    expect(result.exitCode).toBe(0);
    expect(out.text()).toContain("standard");
  });

  it("switches to aether when given an arg", async () => {
    const out = new CapturedStream();
    const ctx = freshCtx();
    await COMMANDS["mode"]!(parseArgs(["aether"]), ctx, out);
    expect(ctx.mode.id).toBe("aether");
    expect(stripAnsi(out.chunks.join(""))).toContain("aether");
  });

  it("rejects unknown modes", async () => {
    const { result, out } = await run("mode", ["bogus"]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toContain("unknown mode");
  });
});

describe("dice command", () => {
  it("validates the dice tuple against the active mode", async () => {
    const out = new CapturedStream();
    const ctx = freshCtx();
    const result = await COMMANDS["dice"]!(parseArgs(["100,200,300"]), ctx, out);
    expect(result.exitCode).toBe(1);
    expect(stripAnsi(out.chunks.join(""))).toMatch(/outside mode range/);
  });

  it("accepts a legal standard tuple", async () => {
    const out = new CapturedStream();
    const ctx = freshCtx();
    const result = await COMMANDS["dice"]!(parseArgs(["2,3,5"]), ctx, out);
    expect(result.exitCode).toBe(0);
    expect(ctx.dice).toEqual([2, 3, 5]);
  });

  it("rejects all-same standard triples (mode legality)", async () => {
    const out = new CapturedStream();
    const ctx = freshCtx();
    const result = await COMMANDS["dice"]!(parseArgs(["7,7,7"]), ctx, out);
    expect(result.exitCode).toBe(1);
    expect(stripAnsi(out.chunks.join(""))).toMatch(/illegal/);
  });
});

describe("roll command", () => {
  it("rolls a 3-arity tuple in standard mode by default", async () => {
    const { result, ctx } = await run("roll", []);
    expect(result.exitCode).toBe(0);
    expect(ctx.dice).toBeTruthy();
    expect(ctx.dice!).toHaveLength(3);
    for (const d of ctx.dice!) {
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(20);
    }
  });
});

describe("board command", () => {
  it("generates a 36-cell random board", async () => {
    const { result, ctx } = await run("board", ["random"]);
    expect(result.exitCode).toBe(0);
    expect(ctx.board).toBeTruthy();
    expect(ctx.board!.cells).toHaveLength(36);
  });

  it("generates a pattern board with the sixes preset", async () => {
    const { result, ctx, out } = await run("board", [
      "pattern",
      "--kind",
      "sixes",
    ]);
    expect(result.exitCode).toBe(0);
    expect(ctx.board!.cells).toHaveLength(36);
    expect(out.text().split("\n").filter((l) => l.trim().length > 0)).toHaveLength(6);
  });

  it("rejects an unknown pattern kind", async () => {
    const { result, out } = await run("board", ["pattern", "--kind", "bogus"]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/unknown pattern/);
  });
});

describe("solve command", () => {
  it("prints an equation for a reachable target", async () => {
    const { result, out } = await run("solve", [
      "--mode", "standard",
      "--dice", "2,3,5",
      "--target", "25",
    ]);
    expect(result.exitCode).toBe(0);
    expect(out.text()).toMatch(/= 25/);
    expect(out.text()).toMatch(/diff [0-9.]+/);
  });

  it("exits 1 with a clear message for unreachable targets", async () => {
    const { result, out } = await run("solve", [
      "--mode", "standard",
      "--dice", "1,1,2",
      "--target", "7919",
    ]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/no solution/);
  });

  it("requires --target", async () => {
    const { result, out } = await run("solve", ["--dice", "2,3,5"]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/--target/);
  });

  it("requires dice (errors when none are set)", async () => {
    const { result, out } = await run("solve", ["--target", "17"]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/no dice/);
  });
});

describe("solve-all command", () => {
  it("prints multiple sorted solutions", async () => {
    const { result, out } = await run("solve-all", [
      "--mode", "standard",
      "--dice", "2,3,5",
      "--target", "10",
    ]);
    expect(result.exitCode).toBe(0);
    const text = out.text();
    expect(text).toMatch(/solutions/);
    const eqLines = text.split("\n").filter((l) => /= 10/.test(l));
    expect(eqLines.length).toBeGreaterThan(1);
  });

  it("respects --limit", async () => {
    const { out } = await run("solve-all", [
      "--mode", "standard",
      "--dice", "2,3,5",
      "--target", "10",
      "--limit", "1",
    ]);
    const eqLines = out.text().split("\n").filter((l) => /= 10/.test(l));
    expect(eqLines).toHaveLength(1);
  });
});

describe("explain command", () => {
  it("prints a difficulty breakdown for a parsed equation", async () => {
    const { result, out } = await run("explain", [
      "--equation", "2 + 3 * 5 = 25",
    ]);
    expect(result.exitCode).toBe(0);
    const text = out.text();
    expect(text).toContain("2 + 3 * 5 = 25");
    expect(text).toContain("Final difficulty");
  });

  it("rejects equations whose total does not match", async () => {
    const { result, out } = await run("explain", [
      "--equation", "2 + 3 + 5 = 999",
    ]);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/parse error/);
  });

  it("requires --equation", async () => {
    const { result, out } = await run("explain", []);
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/--equation/);
  });
});

describe("export command", () => {
  it("prints the deferred-to-Phase-1 message", async () => {
    const { result, out } = await run("export", []);
    expect(result.exitCode).toBe(0);
    expect(out.text()).toMatch(/deferred to Phase 1/);
    expect(out.text()).toMatch(/npm run export/);
  });
});
