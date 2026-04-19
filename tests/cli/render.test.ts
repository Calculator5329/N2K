import { describe, expect, it } from "vitest";
import { OP, STANDARD_MODE } from "../../src/core/constants.js";
import { difficultyBreakdown } from "../../src/services/difficulty.js";
import { ansi, stripAnsi } from "../../src/cli/ansi.js";
import {
  makeBoard,
  renderBoard,
  renderDifficultyBreakdown,
  renderEquation,
  renderEquationWithDifficulty,
} from "../../src/cli/render.js";

describe("ansi helpers", () => {
  it("emits SGR codes when enabled", () => {
    const colored = ansi.red("hi", true);
    expect(colored).toContain("\x1b[");
    expect(colored).toContain("hi");
  });
  it("returns the plain string when disabled", () => {
    expect(ansi.red("hi", false)).toBe("hi");
    expect(ansi.bold("hi", false)).toBe("hi");
  });
  it("stripAnsi removes every SGR sequence", () => {
    expect(stripAnsi(ansi.bold(ansi.red("hi", true), true))).toBe("hi");
  });
});

describe("renderEquation", () => {
  const eq = {
    dice: [2, 3, 5],
    exps: [1, 1, 1],
    ops: [OP.ADD, OP.MUL],
    total: 17,
  };

  it("plain mode matches formatEquation exactly", () => {
    expect(renderEquation(eq, false)).toBe("2 + 3 * 5 = 17");
  });

  it("ansi mode is identical after strip", () => {
    expect(stripAnsi(renderEquation(eq, true))).toBe("2 + 3 * 5 = 17");
  });

  it("renderEquationWithDifficulty appends a [diff ...] tag", () => {
    expect(renderEquationWithDifficulty(eq, STANDARD_MODE, false)).toMatch(
      /^2 \+ 3 \* 5 = 17    \[diff [0-9.]+\]$/,
    );
  });
});

describe("renderDifficultyBreakdown", () => {
  it("renders a multi-line table with header + footer", () => {
    const eq = {
      dice: [2, 3, 5],
      exps: [1, 1, 1],
      ops: [OP.ADD, OP.MUL],
      total: 17,
    };
    const out = renderDifficultyBreakdown(
      difficultyBreakdown(eq, STANDARD_MODE),
      false,
    );
    expect(out).toContain("Term");
    expect(out).toContain("Contribution");
    expect(out).toContain("Final difficulty");
    expect(out.split("\n").length).toBeGreaterThan(5);
  });
});

describe("renderBoard", () => {
  it("renders a 6x6 grid with one row per line", () => {
    const board = makeBoard(Array.from({ length: 36 }, (_, i) => i + 1));
    const out = stripAnsi(renderBoard(board, true));
    const lines = out.split("\n");
    expect(lines).toHaveLength(6);
    for (const line of lines) {
      expect(line.split(/\s+/).filter((x) => x.length > 0)).toHaveLength(6);
    }
  });
});
