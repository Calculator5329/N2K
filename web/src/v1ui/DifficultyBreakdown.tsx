import { useMemo, useState } from "react";
import {
  difficultyBreakdown,
  type DifficultyTerm,
} from "@solver/services/difficulty.js";
import { parseEquation } from "@solver/services/parsing.js";

/**
 * Inline disclosure panel that gives the player a *qualitative* sense of
 * why a given equation has the difficulty score it does.
 *
 * Deliberately opaque: we show the factors at play, the direction each
 * pushes the score, and a coarse magnitude bar — but no raw numbers,
 * weights, divisors, or "input → contribution" math. The full breakdown
 * still exists in `@solver/services/difficulty.ts` for tests + tooling;
 * this UI just refuses to print it.
 */
interface DifficultyBreakdownProps {
  equation: string;
  defaultOpen?: boolean;
}

type Direction = "easier" | "harder" | "neutral";
type Impact = 0 | 1 | 2 | 3;

interface FactorView {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly direction: Direction;
  readonly impact: Impact;
}

/**
 * Player-facing copy keyed by `DifficultyTerm.id`. Describes *what each
 * factor measures*, never the weight, threshold, or formula. Edit copy
 * here if you want to soften / sharpen the language; do NOT add numbers.
 */
const FACTOR_COPY: Record<
  DifficultyTerm["id"],
  { label: string; description: string }
> = {
  totalMagnitude: {
    label: "Target size",
    description: "Bigger targets are harder to reach mentally.",
  },
  shortestDistance: {
    label: "Distance from a free anchor",
    description:
      "Targets that sit close to a power of one of the dice are easier to land.",
  },
  zeroExponents: {
    label: "Trivial exponents",
    description:
      "Each die raised to the 0 collapses to a 1 — a free building block.",
  },
  oneExponents: {
    label: "Bare dice",
    description:
      "Each die left as itself (no exponent work) keeps the equation grounded.",
  },
  largestSubresult: {
    label: "Biggest sub-result",
    description: "How large the biggest intermediate value gets.",
  },
  largestSubresultDistance: {
    label: "Sub-result fit",
    description:
      "How far that biggest value sits from the target — closer is friendlier.",
  },
  smallestMultiplier: {
    label: "Non-trivial multiplication",
    description: "Multiplying by a real factor adds mental load.",
  },
};

/**
 * Coarse magnitude bucket from a contribution's absolute size, in the same
 * units as the published 0–100 score. The thresholds are intentionally
 * wide so they group rather than reveal.
 */
function bucketImpact(absContribution: number): Impact {
  if (absContribution < 0.5) return 0;
  if (absContribution < 2) return 1;
  if (absContribution < 6) return 2;
  return 3;
}

function directionFor(contribution: number): Direction {
  if (contribution < -0.05) return "easier";
  if (contribution > 0.05) return "harder";
  return "neutral";
}

const DIRECTION_LABEL: Record<Direction, string> = {
  easier: "easier",
  harder: "harder",
  neutral: "neutral",
};

const DIRECTION_GLYPH: Record<Direction, string> = {
  easier: "↓",
  harder: "↑",
  neutral: "·",
};

/**
 * 3-cell magnitude meter. Filled cells = how strongly this factor moved
 * the needle; the colour follows the direction.
 */
function ImpactMeter({
  impact,
  direction,
}: {
  impact: Impact;
  direction: Direction;
}) {
  const filledClass =
    direction === "easier"
      ? "bg-oxblood-500"
      : direction === "harder"
      ? "bg-ink-500"
      : "bg-ink-200";
  return (
    <div
      className="inline-flex items-center gap-[3px]"
      aria-label={`${impact} of 3`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={[
            "h-2 w-2 inline-block",
            i <= impact ? filledClass : "bg-ink-100/20",
          ].join(" ")}
          style={{ borderRadius: "1px" }}
        />
      ))}
    </div>
  );
}

/**
 * Player-facing copy for the (rare) post-processing flags. Only the
 * ten-flag is actually surfaced — the upper-tail compression and ceiling
 * clamp are score-shape details that don't help the player understand
 * their equation, so we hide them.
 */
const SHORTCUT_COPY: Partial<Record<string, string>> = {
  tenFlag: "A factor of 10 simplified this equation noticeably.",
};

export function DifficultyBreakdown({
  equation,
  defaultOpen = false,
}: DifficultyBreakdownProps) {
  const [open, setOpen] = useState(defaultOpen);

  const view = useMemo(() => {
    try {
      const breakdown = difficultyBreakdown(parseEquation(equation));
      const factors: FactorView[] = breakdown.terms.map((t) => {
        const copy = FACTOR_COPY[t.id];
        return {
          key: t.id,
          label: copy.label,
          description: copy.description,
          direction: directionFor(t.contribution),
          impact: bucketImpact(Math.abs(t.contribution)),
        };
      });
      const shortcuts = breakdown.adjustments
        .map((a) => SHORTCUT_COPY[a.id])
        .filter((s): s is string => s !== undefined);
      return { factors, shortcuts };
    } catch {
      return null;
    }
  }, [equation]);

  if (view === null) return null;

  // Group: factors with any meaningful contribution come first, then the
  // dormant ones (impact 0) collapsed under a quieter header. This keeps
  // the panel honest — every factor shows up — without hiding the signal.
  const active = view.factors.filter((f) => f.impact > 0);
  const dormant = view.factors.filter((f) => f.impact === 0);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          "label-caps inline-flex items-center gap-1.5",
          "text-ink-100 hover:text-oxblood-500 transition-colors",
        ].join(" ")}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        Why this difficulty?
      </button>

      {open && (
        <div
          className="mt-3 border border-ink-100/15 bg-paper-100/40 px-4 py-3 max-w-xl"
          style={{ borderRadius: "2px" }}
        >
          <p className="text-[12px] italic text-ink-200 mb-3">
            A handful of factors shape the score. Bars show how strongly each
            one moved the needle here.
          </p>

          <ul className="space-y-2.5">
            {active.map((f) => (
              <FactorRow key={f.key} factor={f} />
            ))}
          </ul>

          {dormant.length > 0 && (
            <details className="mt-3 group">
              <summary className="label-caps cursor-pointer text-ink-100 hover:text-ink-300 list-none">
                <span className="inline-block group-open:rotate-90 transition-transform mr-1">
                  ▸
                </span>
                {dormant.length} factor{dormant.length === 1 ? "" : "s"} not in
                play
              </summary>
              <ul className="mt-2 space-y-1.5 pl-4">
                {dormant.map((f) => (
                  <li
                    key={f.key}
                    className="text-[12px] text-ink-100"
                  >
                    {f.label} <span className="text-ink-100/70">— {f.description}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.shortcuts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-ink-100/15">
              <div className="label-caps mb-1.5 text-ink-100">Shortcuts</div>
              <ul className="space-y-1">
                {view.shortcuts.map((s, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-ink-300 flex items-start gap-2"
                  >
                    <span aria-hidden="true" className="text-oxblood-500">
                      ✦
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FactorRow({ factor }: { factor: FactorView }) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3">
      <ImpactMeter impact={factor.impact} direction={factor.direction} />
      <div>
        <div className="text-[13px] text-ink-500">{factor.label}</div>
        <div className="text-[12px] text-ink-100">{factor.description}</div>
      </div>
      <div
        className={[
          "label-caps shrink-0",
          factor.direction === "easier"
            ? "text-oxblood-500"
            : factor.direction === "harder"
            ? "text-ink-500"
            : "text-ink-100",
        ].join(" ")}
      >
        <span aria-hidden="true" className="mr-1">
          {DIRECTION_GLYPH[factor.direction]}
        </span>
        {DIRECTION_LABEL[factor.direction]}
      </div>
    </li>
  );
}
