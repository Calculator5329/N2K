import { describe, expect, it } from "vitest";
import { AETHER_MODE, OP, STANDARD_MODE } from "../src/core/constants.js";
import {
  allSolutions,
  easiestSolution,
  solveForExport,
  sweepOneTuple,
} from "../src/services/solver.js";
import { evaluateLeftToRight } from "../src/services/arithmetic.js";

describe("sweepOneTuple — standard mode", () => {
  it("solves all reachable totals in 1..40 for (2, 3, 5)", () => {
    const map = sweepOneTuple([2, 3, 5], 1, 40, STANDARD_MODE);
    expect(map.size).toBeGreaterThan(10);
    for (const [target, sol] of map) {
      expect(sol.equation.total).toBe(target);
      const evaluated = evaluateLeftToRight(
        sol.equation.dice.map((d, i) => Math.pow(d, sol.equation.exps[i]!)),
        sol.equation.ops,
      );
      expect(Math.round(evaluated)).toBe(target);
    }
  });

  it("respects the standard-mode arity gate", () => {
    expect(() => sweepOneTuple([2, 3, 5, 7], 1, 100, STANDARD_MODE)).toThrow();
  });

  it("depowers compound dice (4 → 2, with extended exponent headroom)", () => {
    // Standard mode: a `4` should be solved as `2^p` with the wider 2-die
    // cap. So solving for total=64 with dice (4, 1, 1) should succeed
    // (because 2^6 = 64, and after depower we have dice (2, 1, 1) with
    // p1 cap of 13).
    const eqv = easiestSolution([4, 1, 1], 64, STANDARD_MODE);
    expect(eqv).not.toBeNull();
    // Compare as a multiset — the solver returns the winning permutation,
    // not the input ordering.
    expect([...eqv!.dice].sort()).toEqual([1, 1, 2]);
  });
});

describe("sweepOneTuple — Æther mode", () => {
  it("solves arity-4 inputs with negative dice", () => {
    const map = sweepOneTuple([-3, 5, 7, 2], 1, 50, AETHER_MODE);
    expect(map.size).toBeGreaterThan(0);
    for (const [target, sol] of map) {
      expect(sol.equation.total).toBe(target);
      expect(sol.equation.dice.length).toBe(4);
    }
  });

  it("hits target 100 with dice (10, 10, 10) → 10*10*1 etc.", () => {
    const map = sweepOneTuple([10, 10, 10], 1, 200, AETHER_MODE);
    expect(map.has(100)).toBe(true);
  });

  it("reports progress per permutation when callback supplied", () => {
    const events: { permsDone: number; permsTotal: number }[] = [];
    sweepOneTuple([2, 3, 5], 1, 50, AETHER_MODE, {}, (p) =>
      events.push({ permsDone: p.permsDone, permsTotal: p.permsTotal }),
    );
    expect(events).toHaveLength(6); // 3! distinct perms of (2,3,5)
    expect(events[events.length - 1]!.permsDone).toBe(6);
    expect(events[0]!.permsTotal).toBe(6);
  });
});

describe("easiestSolution", () => {
  it("returns null for unreachable totals", () => {
    // (1, 1, 2) in standard mode can only ever produce a small set of
    // totals (the depower is a no-op here). A target like 7919 (a prime
    // larger than anything the equation space can build) is unreachable.
    expect(easiestSolution([1, 1, 2], 7919, STANDARD_MODE)).toBeNull();
  });

  it("auto-arity prefers a 3-subset over the full pool when both work (Æther)", () => {
    // Pool of 4 dice, target reachable by some 3-subset.
    const eq = easiestSolution([2, 3, 5, 7], 30, AETHER_MODE);
    expect(eq).not.toBeNull();
    expect(eq!.dice.length).toBe(3);
  });
});

describe("allSolutions", () => {
  it("enumerates multiple distinct equations for an easy target", () => {
    const sols = allSolutions([2, 3, 5], 10, STANDARD_MODE);
    expect(sols.length).toBeGreaterThan(1);
    const keys = new Set(
      sols.map((s) => `${s.dice.join(",")}|${s.exps.join(",")}|${s.ops.join(",")}`),
    );
    expect(keys.size).toBe(sols.length); // all distinct
  });
});

describe("solveForExport", () => {
  it("returns target-sorted output", () => {
    const out = solveForExport([2, 3, 5], 3, 1, 40, STANDARD_MODE);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.equation.total).toBeGreaterThan(out[i - 1]!.equation.total);
    }
  });

  it("rejects arity mismatch loudly", () => {
    expect(() => solveForExport([2, 3, 5, 7], 3, 1, 50, AETHER_MODE)).toThrow();
  });
});
