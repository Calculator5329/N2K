/**
 * CLI-local equation parser.
 *
 * Lives here, not in `src/services/parsing.ts`, because Phase 0
 * deliberately deferred user-typed input. When the canonical parser
 * ships in `services/parsing.ts`, this module is replaced.
 *
 * Grammar (whitespace-flexible, integer-only):
 *
 *   equation := term (op term)* "=" integer
 *   term     := base | base "^" exponent
 *   base     := integer | "(" "-" integer ")"
 *   op       := "+" | "-" | "*" | "/"
 *
 * Operator semantics: strict left-to-right (no precedence), matching
 * the rest of the codebase.
 *
 * Examples:
 *   "2 * 3 ^ 2 * 5 = 90"      → ok
 *   "(-3)^2 + 5 * 7 - 2 = 96" → ok
 *   "2 + 2 = 5"               → throws (asserted total mismatches)
 */
import { OP, OPERATOR_TO_SYMBOL, FLOAT_EQ_EPSILON } from "../core/constants.js";
import type { NEquation, Operator, OperatorSymbol } from "../core/types.js";
import { applyOperator } from "../services/arithmetic.js";

export class ParseError extends Error {
  readonly column: number;
  constructor(message: string, column: number) {
    super(message);
    this.name = "ParseError";
    this.column = column;
  }
}

interface Cursor {
  readonly src: string;
  pos: number;
}

function peek(c: Cursor): string {
  return c.pos < c.src.length ? c.src[c.pos]! : "";
}

function skipWs(c: Cursor): void {
  while (c.pos < c.src.length && /\s/.test(c.src[c.pos]!)) c.pos += 1;
}

function consumeInt(c: Cursor): number {
  skipWs(c);
  const start = c.pos;
  let s = "";
  while (c.pos < c.src.length && /[0-9]/.test(c.src[c.pos]!)) {
    s += c.src[c.pos]!;
    c.pos += 1;
  }
  if (s.length === 0) {
    throw new ParseError(
      `expected an integer at position ${start}`,
      start,
    );
  }
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ParseError(`malformed integer "${s}"`, start);
  }
  return n;
}

function consumeBase(c: Cursor): number {
  skipWs(c);
  if (peek(c) === "(") {
    const start = c.pos;
    c.pos += 1;
    skipWs(c);
    if (peek(c) !== "-") {
      throw new ParseError(
        `parens are only used for negative bases (e.g. "(-3)"); ` +
          `found "${peek(c) || "<eof>"}" at position ${c.pos}`,
        c.pos,
      );
    }
    c.pos += 1; // consume '-'
    const n = consumeInt(c);
    skipWs(c);
    if (peek(c) !== ")") {
      throw new ParseError(
        `expected ")" at position ${c.pos} (paren opened at ${start})`,
        c.pos,
      );
    }
    c.pos += 1;
    return -n;
  }
  return consumeInt(c);
}

function consumeOperator(c: Cursor): Operator | null {
  skipWs(c);
  const ch = peek(c);
  switch (ch) {
    case "+": c.pos += 1; return OP.ADD;
    case "-": c.pos += 1; return OP.SUB;
    case "*": c.pos += 1; return OP.MUL;
    case "/": c.pos += 1; return OP.DIV;
    default:  return null;
  }
}

/** Parse a printed equation back into an `NEquation`, validating the total. */
export function parseEquation(input: string): NEquation {
  const c: Cursor = { src: input, pos: 0 };

  const dice: number[] = [];
  const exps: number[] = [];
  const ops: Operator[] = [];

  // First term.
  dice.push(consumeBase(c));
  exps.push(consumeOptionalExponent(c));

  // (op term)* until '=' or end.
  while (true) {
    skipWs(c);
    if (peek(c) === "=") break;
    if (c.pos >= c.src.length) {
      throw new ParseError(
        `expected "=" before end of input`,
        c.pos,
      );
    }
    const op = consumeOperator(c);
    if (op === null) {
      throw new ParseError(
        `expected operator (+ - * /) or "=" at position ${c.pos}, ` +
          `found "${peek(c)}"`,
        c.pos,
      );
    }
    ops.push(op);
    dice.push(consumeBase(c));
    exps.push(consumeOptionalExponent(c));
  }

  // '=' total
  skipWs(c);
  if (peek(c) !== "=") {
    throw new ParseError(`expected "=" at position ${c.pos}`, c.pos);
  }
  c.pos += 1;
  skipWs(c);
  let totalSign = 1;
  if (peek(c) === "-") {
    totalSign = -1;
    c.pos += 1;
  }
  const claimed = totalSign * consumeInt(c);
  skipWs(c);
  if (c.pos !== c.src.length) {
    throw new ParseError(
      `unexpected trailing input "${c.src.slice(c.pos)}"`,
      c.pos,
    );
  }

  // Validate arity & evaluation.
  if (dice.length < 3 || dice.length > 5) {
    throw new ParseError(
      `equation has ${dice.length} dice (must be 3..5)`,
      0,
    );
  }
  const evaluated = evaluateLeftToRight(dice, exps, ops);
  const rounded = Math.round(evaluated);
  if (
    !Number.isFinite(evaluated) ||
    Math.abs(evaluated - rounded) > FLOAT_EQ_EPSILON
  ) {
    throw new ParseError(
      `equation does not evaluate to an integer (got ${evaluated})`,
      0,
    );
  }
  if (rounded !== claimed) {
    throw new ParseError(
      `equation evaluates to ${rounded}, not the claimed total ${claimed}`,
      0,
    );
  }

  return { dice, exps, ops, total: claimed };
}

function consumeOptionalExponent(c: Cursor): number {
  skipWs(c);
  if (peek(c) !== "^") return 1;
  c.pos += 1;
  return consumeInt(c);
}

function evaluateLeftToRight(
  dice: readonly number[],
  exps: readonly number[],
  ops: readonly Operator[],
): number {
  let acc = Math.pow(dice[0]!, exps[0]!);
  for (let i = 0; i < ops.length; i += 1) {
    const next = Math.pow(dice[i + 1]!, exps[i + 1]!);
    acc = applyOperator(acc, next, ops[i]!);
  }
  return acc;
}

/** Re-export for callers that want to look up an operator's printed glyph. */
export const operatorSymbol = (op: Operator): OperatorSymbol =>
  OPERATOR_TO_SYMBOL[op];
