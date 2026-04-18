/**
 * `roll` — generate a fresh legal dice tuple for the active mode.
 */
import { generateRandomDice } from "../../services/generators.js";
import { optionalInt } from "../parseArgs.js";
import type { CommandFn, CommandResult } from "../context.js";
import { writeln } from "../context.js";
import { ansi } from "../ansi.js";

export const rollCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  const arity = optionalInt(args, "arity") ?? ctx.mode.arities[0]!;
  if (!ctx.mode.arities.includes(arity as 3 | 4 | 5)) {
    writeln(
      out,
      ansi.red(
        `arity ${arity} not allowed by mode "${ctx.mode.id}" ` +
          `(allowed: ${ctx.mode.arities.join(",")})`,
        ctx.tty,
      ),
    );
    return { exitCode: 1 };
  }
  const dice = generateRandomDice(ctx.mode, { arity });
  ctx.dice = dice;
  writeln(out, `rolled: ${ansi.bold(dice.join(", "), ctx.tty)}`);
  return { exitCode: 0 };
};
