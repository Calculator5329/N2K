/**
 * Shared context types for command functions.
 *
 * Keeping this isolated from `index.ts` and `repl.ts` lets the command
 * modules (and their tests) import only the types they need without
 * pulling in `readline` or argv parsing.
 */
import type { Writable } from "node:stream";
import { BUILT_IN_MODES } from "../core/constants.js";
import type { Board, Mode } from "../core/types.js";

export interface CliContext {
  /** Mutable across REPL turns. One-shot mode constructs a fresh ctx per call. */
  mode: Mode;
  dice: readonly number[] | null;
  board: Board | null;
  /** True when stdout supports ANSI colors. */
  readonly tty: boolean;
}

export interface CommandResult {
  readonly exitCode: number;
}

export type CommandFn = (
  args: import("./parseArgs.js").ParsedArgs,
  ctx: CliContext,
  out: Writable,
) => Promise<CommandResult>;

export function defaultContext(tty: boolean): CliContext {
  return {
    mode: BUILT_IN_MODES.standard,
    dice: null,
    board: null,
    tty,
  };
}

/** Resolve a mode id to a `Mode` preset, throwing on unknown ids. */
export function resolveMode(id: string): Mode {
  const norm = id.toLowerCase();
  if (norm === "standard") return BUILT_IN_MODES.standard;
  if (norm === "aether" || norm === "æther") return BUILT_IN_MODES.aether;
  throw new Error(`unknown mode "${id}" (expected "standard" or "aether")`);
}

/** Convenience: write a line to the output stream. */
export function writeln(out: Writable, line = ""): void {
  out.write(`${line}\n`);
}
