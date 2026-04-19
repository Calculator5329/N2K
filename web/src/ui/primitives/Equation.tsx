/**
 * Equation — pretty math rendering with real superscript exponents.
 *
 * The legacy v1 rendered exponents as `^` characters in a monospaced
 * string. v2 lifts the renderer into a proper React component so
 * exponents land in `<sup>` (with a hairline accent color), operators
 * pick up the theme's serif at a lighter weight, and the trailing
 * `= total` gets its own emphasis stop.
 *
 * Two modes:
 *   - `pretty` (default for most themes): tokenized + rendered with
 *     `<sup>` for exponents, math symbols for `*` `/` `-`.
 *   - `ascii`: dumps the equation string verbatim in mono. Used by
 *     blueprint, phosphor, spreadsheet themes via the per-theme
 *     `style.equation` field.
 */

const PRETTY_OP: Readonly<Record<string, string>> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "=": "=",
};

export interface EquationProps {
  readonly equation: string;
  readonly size?: "display" | "large" | "inline";
  readonly style?: "ascii" | "pretty";
  readonly className?: string;
}

interface Token {
  readonly kind: "base" | "op" | "result-token";
  readonly base?: string;
  readonly exp?: string;
  readonly text?: string;
}

function tokenize(equation: string): { lhs: readonly Token[]; rhs: string | null } {
  const [lhsRaw, rhsRaw] = equation.split("=");
  const lhsParts = (lhsRaw ?? "").trim().split(/\s+/).filter(Boolean);
  const lhs: Token[] = lhsParts.map((p): Token => {
    if (PRETTY_OP[p] !== undefined) return { kind: "op", text: p };
    if (p.includes("^")) {
      const [base, exp] = p.split("^");
      return { kind: "base", base: base ?? "", exp: exp ?? "1" };
    }
    return { kind: "base", base: p, exp: undefined };
  });
  const rhs = rhsRaw === undefined ? null : rhsRaw.trim();
  return { lhs, rhs };
}

const SIZE_CLAMP: Readonly<Record<NonNullable<EquationProps["size"]>, string>> = {
  display: "clamp(1.6rem, 4.5vw, 2.4rem)",
  large: "clamp(1.2rem, 3vw, 1.6rem)",
  inline: "1rem",
};

export function Equation({ equation, size = "inline", style = "pretty", className }: EquationProps) {
  if (style === "ascii") {
    return (
      <div
        className={`equation-ascii ${className ?? ""}`.trim()}
        style={{ fontSize: SIZE_CLAMP[size] }}
        aria-label={equation}
      >
        {equation}
      </div>
    );
  }
  const { lhs, rhs } = tokenize(equation);
  return (
    <div
      className={`equation-display ${className ?? ""}`.trim()}
      style={{ fontSize: SIZE_CLAMP[size] }}
      aria-label={equation}
    >
      {lhs.map((t, i) => {
        if (t.kind === "op") {
          return (
            <span key={i} className="equation-op">
              {PRETTY_OP[t.text ?? ""] ?? t.text}
            </span>
          );
        }
        return (
          <span key={i}>
            <span>{t.base}</span>
            {t.exp !== undefined && t.exp !== "1" ? <sup>{t.exp}</sup> : null}
          </span>
        );
      })}
      {rhs !== null ? (
        <>
          <span className="equation-op">{PRETTY_OP["="]}</span>
          <span className="equation-result">{rhs}</span>
        </>
      ) : null}
    </div>
  );
}
