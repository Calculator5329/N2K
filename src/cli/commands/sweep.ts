/**
 * `sweep` — stream best-so-far solutions across a target range.
 *
 * Writes one line per permutation completion, so the user can see
 * progress as the solver tightens. Lines are written via `out.write`
 * (not buffered) so a piped consumer sees them in real time and tests
 * can verify interleaving.
 */
import { sweepOneTuple } from "../../services/solver.js";
import {
  optionalInt,
} from "../parseArgs.js";
import type { CommandFn, CommandResult } from "../context.js";
import { writeln } from "../context.js";
import { ansi } from "../ansi.js";
import { renderEquation } from "../render.js";
import { resolveDice, resolveModeFromArgs } from "./solve.js";

export const sweepCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
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

  const min = optionalInt(args, "min") ?? mode.targetRange.min;
  const max = optionalInt(args, "max") ?? mode.targetRange.max;
  if (min > max) {
    writeln(out, ansi.red(`--min (${min}) must be <= --max (${max})`, ctx.tty));
    return { exitCode: 1 };
  }

  writeln(
    out,
    ansi.gray(
      `sweeping dice (${dice.join(",")}) over [${min}, ${max}] in mode "${mode.id}"...`,
      ctx.tty,
    ),
  );

  const reported = new Set<number>();
  let lastReportedSize = 0;
  try {
    sweepOneTuple(
      dice,
      min,
      max,
      mode,
      {},
      ({ permsDone, permsTotal, best }) => {
        if (best.size === lastReportedSize) {
          // No new targets covered this perm; still emit a tiny progress
          // pulse so callers can verify streaming behavior.
          out.write(
            `${ansi.gray(`# perm ${permsDone}/${permsTotal} (no new targets, ${best.size} covered)`, ctx.tty)}\n`,
          );
          return;
        }
        lastReportedSize = best.size;
        for (const [target, sol] of best) {
          if (reported.has(target)) continue;
          reported.add(target);
          out.write(
            `${String(target).padStart(5)}  ${renderEquation(sol.equation, ctx.tty)}    ` +
              `${ansi.gray(`[diff ${sol.difficulty.toFixed(2)}, perm ${permsDone}/${permsTotal}]`, ctx.tty)}\n`,
          );
        }
      },
    );
  } catch (err) {
    writeln(out, ansi.red((err as Error).message, ctx.tty));
    return { exitCode: 1 };
  }

  writeln(
    out,
    ansi.bold(
      `done — ${reported.size} target${reported.size === 1 ? "" : "s"} covered.`,
      ctx.tty,
    ),
  );
  return { exitCode: 0 };
};
