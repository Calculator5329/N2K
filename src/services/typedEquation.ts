/**
 * Parser for equations people type: the CLI `explain` command and the
 * Play race's equation box. (`services/parsing.ts` stays the strict
 * reader for the canonical printed form.)
 *
 * Grammar (whitespace-flexible, integer-only):
 *
 *   equation := first (op term)* "=" total      (parseEquation)
 *   expr     := first (op term)* ["=" total]    (parseTypedExpression)
 *   first    := term | "-" integer              (a negative Æther die;
 *                                                "-3^2" is refused, type "(-3)^2")
 *   term     := base | base "^" exponent
 *   base     := integer | "(" "-" integer ")"
 *   total    := ["-"] integer
 *   op       := "+" | "-" | "*" | "/"  (also × x ÷ as typed on phones)
 *
 * Every "-" above also accepts the Unicode minus "−" (U+2212).
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
import type { NEquation, Operator } from "../core/types.js";
import { applyOperator } from "./arithmetic.js";

/**
 * A typed equation that could not be read. `column` is the 0-based index
 * into the input; messages count positions from 1, as people do.
 */
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
      `expected an integer at position ${start + 1}`,
      start,
    );
  }
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ParseError(`malformed integer "${s}"`, start);
  }
  return n;
}

function isMinus(ch: string): boolean {
  return ch === "-" || ch === "\u2212";
}

function consumeBase(c: Cursor): number {
  skipWs(c);
  if (peek(c) === "(") {
    const start = c.pos;
    c.pos += 1;
    skipWs(c);
    if (!isMinus(peek(c))) {
      throw new ParseError(
        `parens are only used for negative bases (e.g. "(-3)"); ` +
          `found "${peek(c) || "<eof>"}" at position ${c.pos + 1}`,
        c.pos,
      );
    }
    c.pos += 1; // consume '-'
    const n = consumeInt(c);
    skipWs(c);
    if (peek(c) !== ")") {
      throw new ParseError(
        `expected ")" at position ${c.pos + 1} (paren opened at ${start + 1})`,
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
    case "-":
    case "\u2212": c.pos += 1; return OP.SUB;
    case "*":
    case "x":
    case "X":
    case "\u00d7": c.pos += 1; return OP.MUL; // ×
    case "/":
    case "\u00f7": c.pos += 1; return OP.DIV; // ÷
    default:  return null;
  }
}

/** Parse a printed equation back into an `NEquation`, validating the total. */
export function parseEquation(input: string): NEquation {
  return parse(input, true);
}

/**
 * Parse a typed expression where `= total` is optional. Without it, the
 * total is whatever the expression evaluates to (left to right). Throws
 * `ParseError` with a readable message on bad syntax, division by zero,
 * a non-integer result, or a claimed total the expression does not
 * reach. The dice count and legality against a roll are not checked
 * here, since they depend on the mode; see `claimRefusal` in
 * `games/n2kClassic.ts`.
 */
export function parseTypedExpression(input: string): NEquation {
  return parse(input, false);
}

function parse(input: string, requireTotal: boolean): NEquation {
  const c: Cursor = { src: input, pos: 0 };

  const dice: number[] = [];
  const exps: number[] = [];
  const ops: Operator[] = [];

  // First term. A bare leading minus is a negative die ("-3 + 5 + 7").
  skipWs(c);
  if (isMinus(peek(c))) {
    c.pos += 1;
    const n = consumeInt(c);
    skipWs(c);
    if (peek(c) === "^") {
      const at = c.pos;
      c.pos += 1;
      const e = consumeInt(c);
      throw new ParseError(
        `"-${n}^${e}" is ambiguous; type "(-${n})^${e}" for a negative die`,
        at,
      );
    }
    dice.push(-n);
    exps.push(1);
  } else {
    dice.push(consumeBase(c));
    exps.push(consumeOptionalExponent(c));
  }

  // (op term)* until '=' or end.
  while (true) {
    skipWs(c);
    if (peek(c) === "=") break;
    if (c.pos >= c.src.length && !requireTotal) break;
    if (c.pos >= c.src.length) {
      throw new ParseError(
        `expected "=" before end of input`,
        c.pos,
      );
    }
    const op = consumeOperator(c);
    if (op === null) {
      throw new ParseError(
        `expected operator (+ - * /) or "=" at position ${c.pos + 1}, ` +
          `found "${peek(c)}"`,
        c.pos,
      );
    }
    ops.push(op);
    dice.push(consumeBase(c));
    exps.push(consumeOptionalExponent(c));
  }

  // '=' total (optional for typed expressions)
  skipWs(c);
  let claimed: number | null = null;
  if (peek(c) === "=") {
    c.pos += 1;
    skipWs(c);
    let totalSign = 1;
    if (isMinus(peek(c))) {
      totalSign = -1;
      c.pos += 1;
    }
    claimed = totalSign * consumeInt(c);
  } else if (requireTotal) {
    throw new ParseError(`expected "=" at position ${c.pos + 1}`, c.pos);
  }
  skipWs(c);
  if (c.pos !== c.src.length) {
    throw new ParseError(
      `unexpected trailing input "${c.src.slice(c.pos)}"`,
      c.pos,
    );
  }

  // Printed equations are always 3..5 dice; typed ones leave the count to
  // the mode's rules so the refusal can name them.
  if (requireTotal && (dice.length < 3 || dice.length > 5)) {
    throw new ParseError(
      `equation has ${dice.length} dice (must be 3..5)`,
      0,
    );
  }
  const evaluated = evaluateLeftToRight(dice, exps, ops);
  const rounded = Math.round(evaluated);
  if (!Number.isFinite(evaluated)) {
    throw new ParseError(`equation is too large to evaluate`, 0);
  }
  if (Math.abs(evaluated - rounded) > FLOAT_EQ_EPSILON) {
    throw new ParseError(
      `equation does not evaluate to an integer (got ${evaluated})`,
      0,
    );
  }
  if (claimed !== null && rounded !== claimed) {
    throw new ParseError(
      `equation evaluates to ${rounded}, not the claimed total ${claimed}`,
      0,
    );
  }

  return { dice, exps, ops, total: claimed ?? rounded };
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
    if (ops[i] === OP.DIV && next === 0) {
      throw new ParseError(`equation has a division by zero`, 0);
    }
    acc = applyOperator(acc, next, ops[i]!);
  }
  return acc;
}
