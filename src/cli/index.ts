#!/usr/bin/env node
/**
 * CLI entry point.
 *
 *   no args                  → drop into the REPL
 *   <verb> [args]            → run one command and exit
 *   --help | help [<verb>]   → top-level / per-command help
 *
 * Both modes route through the same `COMMANDS` table, so behavior never
 * diverges between REPL and one-shot.
 */
import process from "node:process";
import type { Writable } from "node:stream";
import { COMMANDS } from "./commands/index.js";
import { findSpec } from "./commands/help.js";
import { defaultContext, writeln } from "./context.js";
import { ansi } from "./ansi.js";
import { parseArgs } from "./parseArgs.js";
import { runRepl } from "./repl.js";

export async function main(
  argv: readonly string[],
  out: Writable = process.stdout,
  err: Writable = process.stderr,
  isTTY = !!process.stdout.isTTY,
): Promise<number> {
  const ctx = defaultContext(isTTY);

  if (argv.length === 0) {
    return runRepl({ input: process.stdin, output: out, ctx });
  }

  const first = argv[0]!;

  if (first === "--help" || first === "-h" || first === "help") {
    return COMMANDS["help"]!(parseArgs(argv.slice(1)), ctx, out).then((r) => r.exitCode);
  }

  const cmd = COMMANDS[first];
  if (cmd === undefined) {
    writeln(err, ansi.red(`unknown command: ${first}`, ctx.tty));
    writeln(err, ansi.gray("run `n2k help` for the command list.", ctx.tty));
    return 1;
  }

  const rest = argv.slice(1);
  if (rest.includes("--help") || rest.includes("-h")) {
    const spec = findSpec(first);
    if (spec === undefined) {
      writeln(out, `(no help for ${first})`);
      return 0;
    }
    writeln(out, `${ansi.bold(spec.name, ctx.tty)} — ${spec.summary}`);
    writeln(out, `  usage: ${spec.usage}`);
    if (spec.examples) {
      writeln(out, "  examples:");
      for (const ex of spec.examples) writeln(out, `    ${ex}`);
    }
    return 0;
  }

  try {
    const result = await cmd(parseArgs(rest), ctx, out);
    return result.exitCode;
  } catch (e) {
    writeln(err, ansi.red(`error: ${(e as Error).message}`, ctx.tty));
    return 1;
  }
}

// Node ESM entry guard. `import.meta.url` is the module URL; when this
// file was started directly via `tsx src/cli/index.ts` (or the `bin`
// shim), `process.argv[1]` resolves to it. We normalize separators
// because Windows paths use backslashes while `import.meta.url` is a
// forward-slash file:// URL.
function isCliEntryPoint(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  const argNorm = arg.replace(/\\/g, "/").toLowerCase();
  const urlNorm = import.meta.url.replace(/^file:\/+/, "").toLowerCase();
  if (urlNorm === argNorm) return true;
  if (urlNorm.endsWith(argNorm)) return true;
  return /(?:^|\/)(?:src|dist)\/cli\/index\.(?:ts|js)$/.test(argNorm);
}

if (isCliEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    },
  );
}
