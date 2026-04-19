import { observer } from "mobx-react-lite";
import { THEMES } from "../core/themes.js";
import { useActiveThemeId } from "./themeOverride.js";

/**
 * Renders a stored equation string ("2^5 + 2^2 + 2^2 = 40").
 *
 * Two variants, picked by the active theme's `equation` field:
 *
 *   rendered — pretty: real superscripts, ×, ÷, − glyphs, accent on result
 *              (Almanac, Broadsheet, Risograph, Arcade)
 *   ascii    — preformatted plain text, "2^3 * 5^1 * 3^0 = 40"
 *              (Phosphor)
 */
type Token =
  | { kind: "base"; coef: string; exp: string }
  | { kind: "op"; symbol: string }
  | { kind: "eq" }
  | { kind: "result"; value: string };

function tokenize(equation: string): Token[] {
  const parts = equation.trim().split(/\s+/);
  const tokens: Token[] = [];
  let sawEquals = false;
  for (const part of parts) {
    if (part === "=") { tokens.push({ kind: "eq" }); sawEquals = true; continue; }
    if (sawEquals)    { tokens.push({ kind: "result", value: part });   continue; }
    if (/^[+\-*/]$/.test(part)) { tokens.push({ kind: "op", symbol: part }); continue; }
    if (part.includes("^")) {
      const [coef = "?", exp = "?"] = part.split("^");
      tokens.push({ kind: "base", coef, exp });
      continue;
    }
    tokens.push({ kind: "base", coef: part, exp: "1" });
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
      {equation}
    </div>
  );
}
