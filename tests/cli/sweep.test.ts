import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli/commands/index.js";
import { defaultContext } from "../../src/cli/context.js";
import { parseArgs } from "../../src/cli/parseArgs.js";
import { stripAnsi } from "../../src/cli/ansi.js";

class StreamingCapture extends Writable {
  /** Per-write timestamps so we can prove streaming behavior. */
  events: { ts: number; chunk: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override _write(chunk: any, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.events.push({
      ts: performance.now(),
      chunk: typeof chunk === "string" ? chunk : chunk.toString("utf8"),
    });
    cb();
  }
  text(): string {
    return stripAnsi(this.events.map((e) => e.chunk).join(""));
  }
  /** Number of distinct writes during the run. */
  writeCount(): number {
    return this.events.length;
  }
}

describe("sweep command", () => {
  it("streams output incrementally rather than all at once", async () => {
    const out = new StreamingCapture();
    const ctx = defaultContext(false);
    const result = await COMMANDS["sweep"]!(
      parseArgs(["--dice", "2,3,5", "--mode", "standard", "--min", "1", "--max", "40"]),
      ctx,
      out,
    );
    expect(result.exitCode).toBe(0);

    // The dice (2,3,5) has 6 distinct permutations; the sweep callback
    // fires per permutation, so we should see substantially more than one
    // distinct write during the run.
    expect(out.writeCount()).toBeGreaterThan(3);

    // Sanity: the final output should include the summary line.
    expect(out.text()).toMatch(/done/);
    expect(out.text()).toMatch(/covered/);
  });

  it("rejects an arity outside the active mode", async () => {
    const out = new StreamingCapture();
    const ctx = defaultContext(false);
    const result = await COMMANDS["sweep"]!(
      parseArgs(["--dice", "2,3,5,7", "--mode", "standard"]),
      ctx,
      out,
    );
    expect(result.exitCode).toBe(1);
    expect(out.text()).toMatch(/arity/);
  });
});
