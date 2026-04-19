/**
 * `mode` — set or print the active mode.
 */
import { resolveMode, writeln } from "../context.js";
import type { CommandFn, CommandResult } from "../context.js";
import { ansi } from "../ansi.js";

export const modeCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  const requested = args.positionals[0];
  if (requested !== undefined) {
    try {
      ctx.mode = resolveMode(requested);
    } catch (err) {
      writeln(out, ansi.red(String((err as Error).message), ctx.tty));
      return { exitCode: 1 };
    }
  }
  writeln(out, `mode: ${ansi.bold(ctx.mode.id, ctx.tty)}`);
  writeln(
    out,
    ansi.gray(
      `dice ∈ [${ctx.mode.diceRange.min}, ${ctx.mode.diceRange.max}], ` +
        `targets ∈ [${ctx.mode.targetRange.min}, ${ctx.mode.targetRange.max}], ` +
        `arities ${ctx.mode.arities.join("/")}, ` +
        `depower=${ctx.mode.depower}`,
      ctx.tty,
    ),
  );
  return { exitCode: 0 };
};
