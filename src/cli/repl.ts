/**
 * Interactive REPL.
 *
 * State (mode / dice / board) lives in a single {@link CliContext}
 * mutated by command functions across turns. Every command is the same
 * function the one-shot dispatcher uses, so the REPL is a thin wrapper
 * around line tokenization → command lookup → exec.
 */
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { CliContext, CommandFn } from "./context.js";
import { writeln } from "./context.js";
import { ansi } from "./ansi.js";
import { COMMAND_NAMES, COMMANDS } from "./commands/index.js";
import { findSpec } from "./commands/help.js";
import { parseArgs } from "./parseArgs.js";

export interface ReplOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly ctx: CliContext;
  /** Suppress the welcome banner — handy in tests. */
  readonly quiet?: boolean;
}

/**
 * Tokenize a REPL line. Honors a single layer of double-quoting so the
 * user can pass `--equation "2 + 3 * 5 = 17"` as one argument.
 */
export function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"') {
      let s = "";
      i += 1;
      while (i < n && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < n) {
          s += line[i + 1]!;
          i += 2;
        } else {
          s += line[i]!;
          i += 1;
        }
      }
      if (i < n) i += 1; // consume closing "
      tokens.push(s);
      continue;
    }
    let s = "";
    while (i < n && !/\s/.test(line[i]!)) {
      s += line[i]!;
      i += 1;
    }
    tokens.push(s);
  }
  return tokens;
}

function completer(line: string): [string[], string] {
  const word = line.trimStart();
  // Only complete the first token (verb).
  if (word.includes(" ")) return [[], line];
  const hits = COMMAND_NAMES.filter((c) => c.startsWith(word));
  return [hits, word];
}

/**
 * Run the REPL loop until the user types `quit`/`exit` or EOF closes
 * the input stream. Returns the final exit code.
 */
export async function runRepl(opts: ReplOptions): Promise<number> {
  const { input, output, ctx, quiet } = opts;
  if (!quiet) {
    writeln(output, ansi.bold("n2k REPL — type `help` for commands, `quit` to exit.", ctx.tty));
    writeln(
      output,
      ansi.gray(
        `mode: ${ctx.mode.id}    dice: (unset)    board: (unset)`,
        ctx.tty,
      ),
    );
  }

  const rl: ReadlineInterface = createInterface({
    input,
    output,
    terminal: false,
    completer,
  });

  let lastExit = 0;
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === "quit" || line === "exit") {
      writeln(output, ansi.gray("bye.", ctx.tty));
      rl.close();
      return 0;
    }
    if (line.startsWith("#")) continue; // comments

    const tokens = tokenizeLine(line);
    if (tokens.length === 0) continue;
    const verb = tokens[0]!;
    const rest = tokens.slice(1);

    if (verb === "?" || verb === "h") {
      const result = await COMMANDS["help"]!(parseArgs(rest), ctx, output);
      lastExit = result.exitCode;
      continue;
    }

    const cmd: CommandFn | undefined = COMMANDS[verb];
    if (cmd === undefined) {
      writeln(output, ansi.red(`unknown command: ${verb} (type "help")`, ctx.tty));
      lastExit = 1;
      continue;
    }

    // Per-command --help shows the spec without executing.
    if (rest.includes("--help") || rest.includes("-h")) {
      await COMMANDS["help"]!(parseArgs([verb]), ctx, output);
      const spec = findSpec(verb);
      if (spec === undefined) writeln(output, `(no detailed help for ${verb})`);
      lastExit = 0;
      continue;
    }

    let parsed;
    try {
      parsed = parseArgs(rest);
    } catch (err) {
      writeln(output, ansi.red((err as Error).message, ctx.tty));
      lastExit = 1;
      continue;
    }
    try {
      const result = await cmd(parsed, ctx, output);
      lastExit = result.exitCode;
    } catch (err) {
      writeln(output, ansi.red(`error: ${(err as Error).message}`, ctx.tty));
      lastExit = 1;
    }
  }

  return lastExit;
}
