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
import {
  OPERATOR_TO_SYMBOL,
  SYMBOL_TO_OPERATOR,
  relabelDepoweredDice,
} from "../core/constants.js";
import type {
  Mode,
  NEquation,
  Operator,
  OperatorSymbol,
} from "../core/types.js";

/**
 * Render one die (value^exp) as a string.
 *
 * `exp === 0` is rendered as `dice^0` (not the bare literal `1`) so the
 * canonical string preserves which die is being used. The collapse to
 * `1` was lossy: `formatEquation({dice:[2,3,2], exps:[3,5,0], ...})`
 * produced `"2^3 + 2^5 * 1"`, which the renderer (and `parseEquation`)
 * then displayed as if a die `1` were in play, hiding the die `3` the
 * player actually rolled. Keeping the explicit `^0` makes the printed
 * form honest at a tiny cosmetic cost (`3^0` instead of `1`), and
 * matches the rendered form's "uses each die exactly once" promise.
 */
export function formatBase(dice: number, exp: number): string {
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

// ---------------------------------------------------------------------------
//  Parsing
// ---------------------------------------------------------------------------

/**
 * Parse an equation printed by {@link formatEquation} back into an
 * `NEquation`. Accepts any arity in {3, 4, 5} and any dice value in
 * the union of Standard and Æther ranges (negatives must be wrapped
 * in parens, matching the rendered form).
 *
 * Throws `SyntaxError` on any malformed input — used by the difficulty
 * breakdown panel and the expression-search admin tools.
 */
export function parseEquation(input: string): NEquation {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length < 5 || tokens.length % 2 === 0) {
    throw new SyntaxError(
      `Expected an odd number of tokens >= 5 (e.g. "2^5 + 2^2 + 2^2 = 40"), got ${tokens.length}`,
    );
  }

  const eqIndex = tokens.length - 2;
  if (tokens[eqIndex] !== "=") {
    throw new SyntaxError(`Expected '=' before total, got "${tokens[eqIndex]}"`);
  }
  const totalStr = tokens[tokens.length - 1]!;
  const total = parseIntStrict(totalStr, "total");

  const exprTokens = tokens.slice(0, eqIndex);
  if (exprTokens.length < 3 || exprTokens.length % 2 === 0) {
    throw new SyntaxError(
      `Expected an odd number of expression tokens (base op base op ...), got ${exprTokens.length}`,
    );
  }

  const dice: number[] = [];
  const exps: number[] = [];
  const ops: Operator[] = [];

  for (let i = 0; i < exprTokens.length; i += 1) {
    if (i % 2 === 0) {
      const [d, p] = parseBase(exprTokens[i]!);
      dice.push(d);
      exps.push(p);
    } else {
      ops.push(parseOperator(exprTokens[i]!));
    }
  }

  return { dice, exps, ops, total };
}

/** Parse a printable operator into its `Operator` code. Throws on unknown. */
export function parseOperator(token: string): Operator {
  const trimmed = token.trim();
  if (!(trimmed in SYMBOL_TO_OPERATOR)) {
    throw new SyntaxError(`Unknown operator: "${token}"`);
  }
  return SYMBOL_TO_OPERATOR[trimmed as OperatorSymbol];
}

function parseBase(token: string): [number, number] {
  // Negative bases render as "(-3)" or "(-3)^2"; strip the wrapping parens.
  const stripped = token.replace(/^\(([^)]+)\)/, "$1");
  const parts = stripped.split("^");
  if (parts.length === 1) {
    return [parseIntStrict(parts[0]!, "dice"), 1];
  }
  if (parts.length !== 2) {
    throw new SyntaxError(`Expected "<dice>^<exp>", got "${token}"`);
  }
  return [parseIntStrict(parts[0]!, "dice"), parseIntStrict(parts[1]!, "exponent")];
}

function parseIntStrict(token: string, label: string): number {
  if (!/^-?\d+$/.test(token)) {
    throw new SyntaxError(`Expected integer for ${label}, got "${token}"`);
  }
  return Number.parseInt(token, 10);
}
