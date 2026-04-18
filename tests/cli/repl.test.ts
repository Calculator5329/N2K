import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultContext } from "../../src/cli/context.js";
import { runRepl, tokenizeLine } from "../../src/cli/repl.js";
import { stripAnsi } from "../../src/cli/ansi.js";

class CaptureStream extends Writable {
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

function scriptInput(lines: readonly string[]): Readable {
  return Readable.from(lines.map((l) => `${l}\n`));
}

describe("tokenizeLine", () => {
  it("splits on whitespace", () => {
    expect(tokenizeLine("solve --target 47")).toEqual([
      "solve",
      "--target",
      "47",
    ]);
  });

  it("preserves quoted strings as a single token", () => {
    expect(tokenizeLine('explain --equation "2 + 3 * 5 = 17"')).toEqual([
      "explain",
      "--equation",
      "2 + 3 * 5 = 17",
    ]);
  });

  it("handles escaped quotes inside quoted strings", () => {
    expect(tokenizeLine('say "hello \\"world\\""')).toEqual([
      "say",
      'hello "world"',
    ]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(tokenizeLine("    ")).toEqual([]);
  });
});

describe("runRepl", () => {
  it("executes a script of commands and returns the last exit code", async () => {
    const out = new CaptureStream();
    const ctx = defaultContext(false);
    const code = await runRepl({
      input: scriptInput([
        "mode aether",
        "dice 2,3,5",
        "solve --target 25",
        "quit",
      ]),
      output: out,
      ctx,
      quiet: true,
    });
    expect(code).toBe(0);
    expect(ctx.mode.id).toBe("aether");
    expect(ctx.dice).toEqual([2, 3, 5]);
    const text = out.text();
    expect(text).toMatch(/= 25/);
    expect(text).toMatch(/bye/);
  });

  it("preserves state across REPL turns (mode + dice persist)", async () => {
    const out = new CaptureStream();
    const ctx = defaultContext(false);
    await runRepl({
      input: scriptInput([
        "dice 2,3,5",
        "mode",
        "dice",
        "quit",
      ]),
      output: out,
      ctx,
      quiet: true,
    });
    const text = out.text();
    expect(text).toMatch(/dice: 2, 3, 5/);
    expect(text).toMatch(/mode: standard/);
  });

  it("reports unknown commands without crashing", async () => {
    const out = new CaptureStream();
    const ctx = defaultContext(false);
    await runRepl({
      input: scriptInput(["frobnicate", "quit"]),
      output: out,
      ctx,
      quiet: true,
    });
    expect(out.text()).toMatch(/unknown command/);
  });

  it("ignores blank lines and # comments", async () => {
    const out = new CaptureStream();
    const ctx = defaultContext(false);
    const code = await runRepl({
      input: scriptInput([
        "",
        "# this is a comment",
        "mode",
        "quit",
      ]),
      output: out,
      ctx,
      quiet: true,
    });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/mode:/);
  });

  it("supports an explain command via quoted equation argument", async () => {
    const out = new CaptureStream();
    const ctx = defaultContext(false);
    await runRepl({
      input: scriptInput([
        'explain --equation "2 + 3 * 5 = 25"',
        "quit",
      ]),
      output: out,
      ctx,
      quiet: true,
    });
    const text = out.text();
    expect(text).toMatch(/Final difficulty/);
    expect(text).toMatch(/2 \+ 3 \* 5 = 25/);
  });

  it("exits cleanly on EOF without explicit quit", async () => {
    const out = new CaptureStream();
    const ctx = defaultContext(false);
    const code = await runRepl({
      input: scriptInput(["mode"]),
      output: out,
      ctx,
      quiet: true,
    });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/mode:/);
  });
});
