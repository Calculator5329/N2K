import { observer } from "mobx-react-lite";
import { THEMES } from "../../core/themes.js";
import { useActiveThemeId } from "../chrome/themeOverride.js";

/**
 * Renders a stored equation string ("2^5 + 2^2 + 2^2 = 40").
 *
 * Two variants, picked by the active theme's `equation` field:
 *
 *   rendered — pretty: real superscripts, ×, ÷, − glyphs, accent on result
 *              (Almanac, Broadsheet, Risograph, Arcade)
 *   ascii    — preformatted plain text, "2^3 * 5^1 * 3^0 = 40"
 *              (Phosphor)
 *
 * IMPORTANT — precedence:
 *   N2K equations are evaluated strictly left-to-right with no operator
 *   precedence (see `services/arithmetic.ts`). The canonical printed
 *   form, `"2^0 + 3^0 * 7^2 + 5^0 + 11^0 = 100"`, looks wrong to a
 *   reader applying PEMDAS (1 + 49 + 1 + 1 = 52) even though it is
 *   correct under LTR (((1+1)*49)+1)+1 = 100. To remove that ambiguity,
 *   the renderer inserts the **minimum** parentheses needed so a PEMDAS
 *   reading evaluates the same as the LTR computation. The underlying
 *   string from `formatEquation` is unchanged — paren insertion happens
 *   only at render time.
 */
type Token =
  | { kind: "base"; coef: string; exp: string }
  | { kind: "op"; symbol: string }
  | { kind: "paren"; symbol: "(" | ")" }
  | { kind: "eq" }
  | { kind: "result"; value: string };

function tokenize(equation: string): Token[] {
  const parts = equation.trim().split(/\s+/);

  // Split around "=" so the precedence-paren pass only operates on the
  // expression side; the result token is always a single number.
  const eqIdx = parts.indexOf("=");
  const lhs = eqIdx >= 0 ? parts.slice(0, eqIdx) : parts;
  const rhs = eqIdx >= 0 ? parts.slice(eqIdx) : [];

  // Precedence-paren pass over the LHS:
  //   When emitting `expr OP atom`, we need parens around `expr` iff
  //     OP is `*` or `/`, AND
  //     the previous outer op of `expr` was `+` or `-`.
  //   Wrapping is "from the very start" — open paren goes at index 0,
  //   close paren just before the new op. Subsequent `+`/`-` ops never
  //   need wrapping because their left operand's outer op is now `*`/`/`,
  //   which already binds tighter than `+`/`-` under PEMDAS.
  const lhsTokens: Token[] = [];
  let lastOuterOp: string | null = null;
  for (const part of lhs) {
    if (/^[+\-*/]$/.test(part)) {
      const needsWrap =
        (part === "*" || part === "/") &&
        (lastOuterOp === "+" || lastOuterOp === "-");
      if (needsWrap) {
        lhsTokens.unshift({ kind: "paren", symbol: "(" });
        lhsTokens.push({ kind: "paren", symbol: ")" });
      }
      lhsTokens.push({ kind: "op", symbol: part });
      lastOuterOp = part;
      continue;
    }
    if (part.includes("^")) {
      const [coef = "?", exp = "?"] = part.split("^");
      lhsTokens.push({ kind: "base", coef, exp });
      continue;
    }
    lhsTokens.push({ kind: "base", coef: part, exp: "1" });
  }

  const tokens: Token[] = [...lhsTokens];
  for (const part of rhs) {
    if (part === "=") { tokens.push({ kind: "eq" }); continue; }
    tokens.push({ kind: "result", value: part });
  }
  return tokens;
}

const PRETTY_OP: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

interface EquationProps {
  equation: string;
  /** "display" = hero size, "inline" = inline body usage. */
  size?: "display" | "large" | "inline";
  className?: string;
}

export const Equation = observer(function Equation(props: EquationProps) {
  // Per-subtree theme override (used by the edition gallery) takes
  // precedence over the global theme.
  const themeId = useActiveThemeId();
  if (THEMES[themeId].equation === "ascii") {
    return <EquationAscii {...props} />;
  }
  return <EquationRendered {...props} />;
});

// ---------------------------------------------------------------------------
//  Variant: RENDERED — pretty superscripts, custom operators, accent result
// ---------------------------------------------------------------------------
function EquationRendered({ equation, size = "large", className = "" }: EquationProps) {
  const tokens = tokenize(equation);

  const sizes = {
    display: {
      base: "text-[clamp(2.25rem,10vw,4rem)]",
      op: "text-[clamp(1.75rem,7vw,2.75rem)]",
      exp: "text-[clamp(1rem,4vw,1.75rem)]",
      gap: "gap-2 sm:gap-3",
    },
    large: {
      base: "text-[clamp(1.75rem,6vw,2.125rem)]",
      op: "text-[clamp(1.25rem,4vw,1.5rem)]",
      exp: "text-[clamp(0.875rem,2.5vw,1rem)]",
      gap: "gap-2 sm:gap-2.5",
    },
    inline: { base: "text-[15px]", op: "text-[13px]", exp: "text-[10px]", gap: "gap-1.5" },
  }[size];

  return (
    <div
      className={["equation-display flex items-center flex-wrap", sizes.gap, className].join(" ")}
      aria-label={equation}
    >
      {tokens.map((t, i) => {
        if (t.kind === "op") {
          return (
            <span key={i} className={`${sizes.op} text-ink-200 font-light`}>
              {PRETTY_OP[t.symbol] ?? t.symbol}
            </span>
          );
        }
        if (t.kind === "paren") {
          // Parens render slightly lighter than bases so they read as
          // grouping marks, not part of the equation's content. They use
          // the base size (not op size) so they hug the digits cleanly.
          return (
            <span
              key={i}
              className={`${sizes.base} text-ink-200 font-light`}
              aria-hidden="true"
            >
              {t.symbol}
            </span>
          );
        }
        if (t.kind === "eq") {
          return (
            <span key={i} className={`${sizes.op} text-ink-100 mx-1`} aria-hidden="true">=</span>
          );
        }
        if (t.kind === "result") {
          return (
            <span key={i} className={`${sizes.base} text-oxblood-500 font-medium`}>{t.value}</span>
          );
        }
        return (
          <span key={i} className="inline-flex items-start">
            <span className={`${sizes.base} text-ink-500 font-medium`}>{t.coef}</span>
            <sup
              className={`${sizes.exp} text-ink-200 font-normal ml-[1px] mt-[2px]`}
              style={{ verticalAlign: "super", lineHeight: 1 }}
            >
              {t.exp}
            </sup>
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Variant: ASCII — preformatted plain-text equation, no glyph substitution
// ---------------------------------------------------------------------------
function EquationAscii({ equation, size = "large", className = "" }: EquationProps) {
  const sizes = {
    display: "text-[clamp(1.75rem,8vw,2.75rem)]",
    large:   "text-[clamp(1.125rem,4vw,1.625rem)]",
    inline:  "text-[14px]",
  }[size];

  return (
    <div
      className={["equation-ascii whitespace-pre-wrap break-words", sizes, className].join(" ")}
      aria-label={equation}
    >
      {tokensToAscii(tokenize(equation))}
    </div>
  );
}

/**
 * Re-serialize a tokenized equation back to a plain ASCII string —
 * including any LTR-precedence parens the tokenizer inserted. Used by
 * the ASCII variant so Phosphor users see the same disambiguated form
 * as the rendered themes.
 */
function tokensToAscii(tokens: readonly Token[]): string {
  let out = "";
  let prevWasOpenParen = false;
  for (const t of tokens) {
    let piece: string;
    let attachLeft = false;
    let suppressNextSpace = false;
    switch (t.kind) {
      case "base":
        piece = t.exp === "1" ? t.coef : `${t.coef}^${t.exp}`;
        break;
      case "op":   piece = t.symbol; break;
      case "eq":   piece = "="; break;
      case "result": piece = t.value; break;
      case "paren":
        piece = t.symbol;
        attachLeft = t.symbol === ")";
        suppressNextSpace = t.symbol === "(";
        break;
    }
    if (out.length === 0)         out = piece;
    else if (prevWasOpenParen)    out += piece;
    else if (attachLeft)          out += piece;
    else                          out += " " + piece;
    prevWasOpenParen = suppressNextSpace;
  }
  return out;
}
