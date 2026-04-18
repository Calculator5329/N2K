/**
 * Pure formatters for the CLI: equations, difficulty breakdowns, boards.
 *
 * Equation rendering reuses `services/parsing.ts::formatEquation` so the
 * CLI and any future surface print the same canonical form.
 *
 * ANSI color is opt-in per call (the `tty` boolean comes from
 * `process.stdout.isTTY` in production, `false` in piped output and in
 * tests).
 */
import { BOARD } from "../core/constants.js";
import type { Board, Mode, NEquation } from "../core/types.js";
import {
  difficultyBreakdown,
  type DifficultyBreakdown,
} from "../services/difficulty.js";
import { formatEquation } from "../services/parsing.js";
import { ansi } from "./ansi.js";

// ---------------------------------------------------------------------------
//  Equation rendering
// ---------------------------------------------------------------------------

/** Color-aware single-line equation rendering. */
export function renderEquation(eq: NEquation, tty: boolean): string {
  const text = formatEquation(eq);
  // Color the `= total` tail to make it pop.
  const m = text.match(/^(.*?)\s=\s(-?\d+)$/);
  if (!m) return text;
  return `${m[1]} ${ansi.dim("=", tty)} ${ansi.bold(m[2]!, tty)}`;
}

/**
 * Render an equation alongside its difficulty score.
 *
 *     2 + 3 * 5 = 17    [diff 4.12]
 */
export function renderEquationWithDifficulty(
  eq: NEquation,
  mode: Mode,
  tty: boolean,
): string {
  const diff = difficultyBreakdown(eq, mode).final;
  const eqStr = renderEquation(eq, tty);
  return `${eqStr}    ${ansi.gray(`[diff ${diff.toFixed(2)}]`, tty)}`;
}

// ---------------------------------------------------------------------------
//  Difficulty breakdown table
// ---------------------------------------------------------------------------

/**
 * Render the full difficulty breakdown as a 2-column table.
 *
 *     Term                                      Contribution
 *     ────────────────────────────────────────  ────────────
 *     Target magnitude                                  4.12
 *     ...
 *     Raw subtotal                                     12.34
 *     ─ Adjustment: ×10 simplification (...) → 6.21
 *     Final difficulty                                  6.21
 */
export function renderDifficultyBreakdown(
  breakdown: DifficultyBreakdown,
  tty: boolean,
): string {
  const labelWidth = Math.max(
    "Term".length,
    "Raw subtotal".length,
    "Final difficulty".length,
    ...breakdown.terms.map((t) => t.label.length),
  );
  const colHead = pad("Term", labelWidth);
  const lines: string[] = [];
  lines.push(`${ansi.bold(colHead, tty)}  ${ansi.bold("Contribution", tty)}`);
  lines.push(
    `${"─".repeat(labelWidth)}  ${"─".repeat("Contribution".length)}`,
  );
  for (const t of breakdown.terms) {
    const contribStr = formatNumber(t.contribution).padStart(
      "Contribution".length,
    );
    lines.push(`${pad(t.label, labelWidth)}  ${contribStr}`);
    if (t.input.length > 0) {
      lines.push(
        `${pad("", labelWidth)}  ${ansi.gray(t.input, tty)}`,
      );
    }
  }
  lines.push(
    `${pad("Raw subtotal", labelWidth)}  ${formatNumber(breakdown.rawSubtotal).padStart("Contribution".length)}`,
  );
  for (const adj of breakdown.adjustments) {
    lines.push(
      ansi.yellow(
        `· ${adj.label}: ${adj.note} → ${formatNumber(adj.after)}`,
        tty,
      ),
    );
  }
  lines.push(
    `${ansi.bold(pad("Final difficulty", labelWidth), tty)}  ${ansi.bold(formatNumber(breakdown.final).padStart("Contribution".length), tty)}`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
//  Board rendering
// ---------------------------------------------------------------------------

/** Render a 6×6 board as a fixed-width grid. */
export function renderBoard(board: Board, tty: boolean): string {
  const cellWidth = Math.max(
    ...board.cells.map((v) => String(v).length),
    3,
  );
  const lines: string[] = [];
  for (let r = 0; r < board.rows; r += 1) {
    const row: string[] = [];
    for (let c = 0; c < board.cols; c += 1) {
      const v = board.cells[r * board.cols + c]!;
      row.push(String(v).padStart(cellWidth));
    }
    lines.push(ansi.cyan(row.join("  "), tty));
  }
  return lines.join("\n");
}

/** Wrap a `number[]` row-major sequence into a `Board` of standard size. */
export function makeBoard(cells: readonly number[]): Board {
  if (cells.length !== BOARD.size) {
    throw new RangeError(
      `makeBoard: expected ${BOARD.size} cells, got ${cells.length}`,
    );
  }
  return { rows: BOARD.rows, cols: BOARD.cols, cells: cells.slice() };
}

// ---------------------------------------------------------------------------
//  Misc helpers
// ---------------------------------------------------------------------------

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

/** Render a "no solution" message in a consistent way. */
export function renderNoSolution(target: number, tty: boolean): string {
  return ansi.red(`no solution for target ${target}`, tty);
}

/** Render a heading row, e.g. for `solve-all` output. */
export function renderHeading(text: string, tty: boolean): string {
  return ansi.bold(text, tty);
}
