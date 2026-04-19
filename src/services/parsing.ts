/**
 * Equation rendering.
 *
 * `formatEquation` is the canonical way to print an `NEquation` for the
 * UI, the CLI, and the bulk-export inspector. Parsing the printed form
 * back into an `NEquation` is intentionally not implemented yet — every
 * v2 surface either generates equations or reads them from the dataset,
 * never types them. Add a `parseEquation` here when user-typed input
 * lands.
 *
 * Format:
 *   - Each die is rendered as `dice` if exp == 1, `1` if exp == 0,
 *     `dice^exp` otherwise.
 *   - Negative dice (Æther mode only) are wrapped in parens so the
 *     leading `-` doesn't fuse with the previous operator: `... + (-3)^2 ...`.
 *   - Operators are surrounded by single spaces.
 *   - The total is appended with ` = total` (no parens).
 */
import { OPERATOR_TO_SYMBOL, relabelDepoweredDice } from "../core/constants.js";
import type { Mode, NEquation } from "../core/types.js";

/** Render one die (value^exp) as a string. */
export function formatBase(dice: number, exp: number): string {
  if (exp === 0) return "1";
  const baseStr = dice < 0 ? `(${dice})` : `${dice}`;
  if (exp === 1) return baseStr;
  return `${baseStr}^${exp}`;
}

/** Render an equation in canonical form: `d1^p1 o1 d2^p2 o2 d3 = total`. */
export function formatEquation(eq: NEquation): string {
  const { dice, exps, ops, total } = eq;
  if (dice.length !== exps.length) {
    throw new RangeError(
      `formatEquation: dice.length (${dice.length}) !== exps.length (${exps.length})`,
    );
  }
  if (ops.length !== dice.length - 1) {
    throw new RangeError(
      `formatEquation: ops.length (${ops.length}) !== dice.length - 1 (${dice.length - 1})`,
    );
  }
  const parts: string[] = [];
  for (let i = 0; i < dice.length; i += 1) {
    if (i > 0) parts.push(OPERATOR_TO_SYMBOL[ops[i - 1]!]);
    parts.push(formatBase(dice[i]!, exps[i]!));
  }
  parts.push("=");
  parts.push(String(total));
  return parts.join(" ");
}

/**
 * Render the *expression* part only (no ` = total`). Useful when the
 * caller is rendering the target separately (e.g. as a board cell).
 */
export function formatExpression(eq: NEquation): string {
  return formatEquation(eq).replace(/\s*=.*$/, "");
}

/**
 * Like {@link formatEquation} but relabels the equation's dice back to
 * the originals from `originalPool` for display. Standard mode depowers
 * compound dice (16/8/4 → 2; 9 → 3) before solving, so an equation
 * generated from a `[16, 8, 12]` pool comes back with `dice = [2, 2,
 * 12]` and renders as `2^2 + 2 / 12 = …` by default — confusing for
 * the player who's holding a 16 and an 8 in their hand. This helper
 * relabels each depowered value back to the largest matching original
 * die from the pool so the rendered form lines up with what the
 * player rolled: `16^0 + 8^1 / 12 = …`.
 *
 * Æther mode (`mode.depower === false`) is a pure passthrough — no
 * relabeling, no surprises.
 *
 * If `originalPool` doesn't contain enough compound dice to cover the
 * equation (e.g. the equation uses two depowered 2s but the pool only
 * had one 8), the leftover values render as-is.
 */
export function formatEquationAgainstPool(
  eq: NEquation,
  originalPool: readonly number[],
  mode: Mode,
): string {
  const labeledDice = relabelDepoweredDice(eq.dice, originalPool, mode);
  return formatEquation({ ...eq, dice: labeledDice });
}

/** Expression-only counterpart of {@link formatEquationAgainstPool}. */
export function formatExpressionAgainstPool(
  eq: NEquation,
  originalPool: readonly number[],
  mode: Mode,
): string {
  return formatEquationAgainstPool(eq, originalPool, mode).replace(/\s*=.*$/, "");
}
