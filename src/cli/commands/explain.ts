/**
 * `explain` — print the difficulty breakdown for a typed equation.
 *
 * Uses the CLI-local `parseEquation` (will be replaced by the canonical
 * services parser when it lands).
 */
import { difficultyBreakdown } from "../../services/difficulty.js";
import { optionalString } from "../parseArgs.js";
import type { CommandFn, CommandResult } from "../context.js";
import { resolveMode, writeln } from "../context.js";
import { ansi } from "../ansi.js";
import { parseEquation } from "../parseEquation.js";
import { renderDifficultyBreakdown, renderEquation } from "../render.js";

export const explainCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  const eqStr = optionalString(args, "equation");
  if (eqStr === undefined || eqStr.length === 0) {
    writeln(out, ansi.red(`missing required --equation "<...>"`, ctx.tty));
    return { exitCode: 1 };
  }
  let mode = ctx.mode;
  const modeId = optionalString(args, "mode");
  if (modeId !== undefined) {
    try {
      mode = resolveMode(modeId);
    } catch (err) {
      writeln(out, ansi.red((err as Error).message, ctx.tty));
      return { exitCode: 1 };
    }
  }

  let eq;
  try {
    eq = parseEquation(eqStr);
  } catch (err) {
    writeln(out, ansi.red(`parse error: ${(err as Error).message}`, ctx.tty));
    return { exitCode: 1 };
  }

  if (!mode.arities.includes(eq.dice.length as 3 | 4 | 5)) {
    writeln(
      out,
      ansi.yellow(
        `note: equation arity ${eq.dice.length} is outside mode "${mode.id}" arities ` +
          `${mode.arities.join("/")}, scoring with the heuristic anyway.`,
        ctx.tty,
      ),
    );
  }

  writeln(out, renderEquation(eq, ctx.tty));
  writeln(out);
  writeln(out, renderDifficultyBreakdown(difficultyBreakdown(eq, mode), ctx.tty));
  return { exitCode: 0 };
};
