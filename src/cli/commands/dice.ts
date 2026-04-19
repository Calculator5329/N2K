/**
 * `dice` — set or print the active dice tuple.
 */
import { isLegalDiceForMode } from "../../services/generators.js";
import type { CommandFn, CommandResult } from "../context.js";
import { writeln } from "../context.js";
import { ansi } from "../ansi.js";

function parseDiceList(s: string): number[] {
  const parts = s.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error("dice list is empty");
  }
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`"${p}" is not an integer`);
    }
    out.push(n);
  }
  return out;
}

export const diceCommand: CommandFn = async (args, ctx, out): Promise<CommandResult> => {
  const arg = args.positionals[0];
  if (arg !== undefined) {
    let dice: number[];
    try {
      dice = parseDiceList(arg);
    } catch (err) {
      writeln(out, ansi.red(`bad dice list: ${(err as Error).message}`, ctx.tty));
      return { exitCode: 1 };
    }
    if (dice.length < 3 || dice.length > 5) {
      writeln(out, ansi.red(`dice tuple must have 3..5 entries (got ${dice.length})`, ctx.tty));
      return { exitCode: 1 };
    }
    if (!ctx.mode.arities.includes(dice.length as 3 | 4 | 5)) {
      writeln(
        out,
        ansi.red(
          `arity ${dice.length} not allowed by mode "${ctx.mode.id}" ` +
            `(allowed: ${ctx.mode.arities.join(",")})`,
          ctx.tty,
        ),
      );
      return { exitCode: 1 };
    }
    for (const d of dice) {
      if (d < ctx.mode.diceRange.min || d > ctx.mode.diceRange.max) {
        writeln(
          out,
          ansi.red(
            `dice value ${d} outside mode range ` +
              `[${ctx.mode.diceRange.min}, ${ctx.mode.diceRange.max}]`,
            ctx.tty,
          ),
        );
        return { exitCode: 1 };
      }
    }
    if (!isLegalDiceForMode(dice, ctx.mode)) {
      writeln(out, ansi.red(`illegal dice tuple for mode "${ctx.mode.id}"`, ctx.tty));
      return { exitCode: 1 };
    }
    ctx.dice = dice;
  }
  if (ctx.dice === null) {
    writeln(out, ansi.gray("dice: (unset — use `dice 2,3,5` or `roll`)", ctx.tty));
    return { exitCode: 0 };
  }
  writeln(out, `dice: ${ansi.bold(ctx.dice.join(", "), ctx.tty)}`);
  return { exitCode: 0 };
};
