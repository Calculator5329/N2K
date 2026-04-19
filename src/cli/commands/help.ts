/**
 * `help` — list every command, or print usage for one command.
 */
import type { CommandFn, CommandResult } from "../context.js";
import { writeln } from "../context.js";
import { ansi } from "../ansi.js";

export interface CommandSpec {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly examples?: readonly string[];
}

export const COMMAND_SPECS: readonly CommandSpec[] = [
  { name: "mode", summary: "Set or print the active mode (standard | aether).", usage: "mode [standard|aether]", examples: ["mode aether", "mode"] },
  { name: "dice", summary: "Set or print the active dice tuple.", usage: "dice [d1,d2,d3,...]", examples: ["dice 2,3,5", "dice"] },
  { name: "roll", summary: "Roll a fresh legal dice tuple for the active mode.", usage: "roll [--arity <n>]", examples: ["roll --arity 4"] },
  { name: "board", summary: "Generate or print a board.", usage: "board [random|pattern] [--kind sixes|threes|...]", examples: ["board random", "board pattern --kind sixes", "board"] },
  { name: "solve", summary: "Find the easiest equation for a target.", usage: "solve --target <n> [--dice ...] [--mode ...]", examples: ["solve --target 47", "solve --target 47 --dice 2,3,5 --mode standard"] },
  { name: "solve-all", summary: "Print every distinct equation for a target.", usage: "solve-all --target <n> [--dice ...] [--mode ...] [--limit <n>]", examples: ["solve-all --target 47 --limit 25"] },
  { name: "sweep", summary: "Stream best-so-far solutions across a target range.", usage: "sweep [--dice ...] [--mode ...] [--min <n>] [--max <n>]", examples: ["sweep --dice 2,3,5"] },
  { name: "explain", summary: "Print the full difficulty breakdown for a typed equation.", usage: "explain --equation \"2 * 3 ^ 2 * 5 = 90\" [--mode ...]", examples: ["explain --equation \"2 * 3 ^ 2 * 5 = 90\""] },
  { name: "export", summary: "Run the bulk export pipeline (deferred to Phase 1).", usage: "export [--mode ...] [--out ...]" },
  { name: "help", summary: "List commands or show usage for one.", usage: "help [<command>]" },
  { name: "quit", summary: "Exit the REPL (REPL only).", usage: "quit" },
];

const SPEC_BY_NAME = new Map(COMMAND_SPECS.map((s) => [s.name, s]));

export function findSpec(name: string): CommandSpec | undefined {
  return SPEC_BY_NAME.get(name);
}

export const helpCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  const target = args.positionals[0];
  if (target !== undefined) {
    const spec = SPEC_BY_NAME.get(target);
    if (spec === undefined) {
      writeln(out, ansi.red(`unknown command: ${target}`, ctx.tty));
      return { exitCode: 1 };
    }
    writeln(out, `${ansi.bold(spec.name, ctx.tty)} — ${spec.summary}`);
    writeln(out, `  usage: ${spec.usage}`);
    if (spec.examples && spec.examples.length > 0) {
      writeln(out, "  examples:");
      for (const ex of spec.examples) writeln(out, `    ${ex}`);
    }
    return { exitCode: 0 };
  }

  writeln(out, ansi.bold("n2k commands:", ctx.tty));
  const w = Math.max(...COMMAND_SPECS.map((s) => s.name.length));
  for (const spec of COMMAND_SPECS) {
    writeln(out, `  ${spec.name.padEnd(w)}  ${spec.summary}`);
  }
  writeln(out);
  writeln(out, ansi.gray("global flags: --help, --json (planned)", ctx.tty));
  return { exitCode: 0 };
};
