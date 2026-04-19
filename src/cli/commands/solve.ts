/**
 * `solve` — find the easiest equation for a target.
 */
import { allSolutions, easiestSolution } from "../../services/solver.js";
import { difficultyOfEquation } from "../../services/difficulty.js";
import {
  optionalInt,
  optionalIntList,
  optionalString,
  requireString,
} from "../parseArgs.js";
import type { CommandFn, CommandResult, CliContext } from "../context.js";
import { resolveMode, writeln } from "../context.js";
import { ansi } from "../ansi.js";
import {
  renderEquationWithDifficulty,
  renderHeading,
  renderNoSolution,
} from "../render.js";

function resolveDice(args: Parameters<CommandFn>[0], ctx: CliContext): readonly number[] | null {
  const arg = optionalIntList(args, "dice");
  if (arg !== undefined) return arg;
  return ctx.dice;
}

function resolveModeFromArgs(args: Parameters<CommandFn>[0], ctx: CliContext) {
  const id = optionalString(args, "mode");
  if (id === undefined) return ctx.mode;
  return resolveMode(id);
}

export const solveCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  let target: number;
  try {
    const t = optionalInt(args, "target");
    if (t === undefined) throw new Error("missing required --target");
    target = t;
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }

  let mode;
  try {
    mode = resolveModeFromArgs(args, ctx);
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }
  const dice = resolveDice(args, ctx);
  if (dice === null) {
    writeln(out, ansi.red("no dice — set with `dice 2,3,5`, `roll`, or `--dice ...`", ctx.tty));
    return { exitCode: 1 };
  }

  let eq;
  try {
    eq = easiestSolution(dice, target, mode);
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }
  if (eq === null) {
    writeln(out, renderNoSolution(target, ctx.tty));
    return { exitCode: 1 };
  }
  writeln(out, renderEquationWithDifficulty(eq, mode, ctx.tty));
  return { exitCode: 0 };
};

export const solveAllCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  let target: number;
  try {
    const t = optionalInt(args, "target");
    if (t === undefined) throw new Error("missing required --target");
    target = t;
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }
  let mode;
  try {
    mode = resolveModeFromArgs(args, ctx);
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }
  const dice = resolveDice(args, ctx);
  if (dice === null) {
    writeln(out, ansi.red("no dice — set with `dice 2,3,5`, `roll`, or `--dice ...`", ctx.tty));
    return { exitCode: 1 };
  }
  if (!mode.arities.includes(dice.length as 3 | 4 | 5)) {
    writeln(
      out,
      ansi.red(
        `dice arity ${dice.length} not allowed by mode "${mode.id}"`,
        ctx.tty,
      ),
    );
    return { exitCode: 1 };
  }
  const limit = optionalInt(args, "limit");

  let solutions;
  try {
    solutions = allSolutions(dice, target, mode);
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }
  if (solutions.length === 0) {
    writeln(out, renderNoSolution(target, ctx.tty));
    return { exitCode: 1 };
  }
  const scored = solutions
    .map((eq) => ({ eq, diff: difficultyOfEquation(eq, mode) }))
    .sort((a, b) => a.diff - b.diff);

  const shown = limit === undefined ? scored : scored.slice(0, Math.max(0, limit));
  writeln(
    out,
    renderHeading(
      `${shown.length} of ${scored.length} solution${scored.length === 1 ? "" : "s"} (sorted by difficulty)`,
      ctx.tty,
    ),
  );
  for (const { eq } of shown) {
    writeln(out, renderEquationWithDifficulty(eq, mode, ctx.tty));
  }
  return { exitCode: 0 };
};

// Re-export the dice/mode helpers so other commands can mirror the resolution.
export { resolveDice, resolveModeFromArgs };

// Force usage so the `requireString` import isn't accidentally pruned by
// future callers; harmless in production, keeps the import surface stable.
void requireString;
