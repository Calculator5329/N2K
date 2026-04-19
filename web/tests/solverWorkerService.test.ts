import { describe, it, expect } from "vitest";
import { InlineSolverService } from "../src/services/solverWorkerService.js";
import { BUILT_IN_MODES } from "@platform/core/constants.js";

const standard = BUILT_IN_MODES.standard;

describe("InlineSolverService", () => {
  it("allSolutions returns at least one equation for a reachable target", async () => {
    const svc = new InlineSolverService();
    const sols = await svc.allSolutions({ mode: standard, dice: [2, 3, 5], total: 6 });
    expect(sols.length).toBeGreaterThan(0);
    for (const eq of sols) expect(eq.total).toBe(6);
  });

  it("allSolutions returns [] when target is unreachable", async () => {
    const svc = new InlineSolverService();
    const sols = await svc.allSolutions({ mode: standard, dice: [2, 2, 2], total: 99999 });
    expect(sols).toEqual([]);
  });

  it("allSolutions returns [] when dice arity is illegal for the mode", async () => {
    const svc = new InlineSolverService();
    const sols = await svc.allSolutions({ mode: standard, dice: [2, 3, 5, 6], total: 16 });
    expect(sols).toEqual([]);
  });

  it("easiestSolution returns null when nothing matches", async () => {
    const svc = new InlineSolverService();
    const eq = await svc.easiestSolution({ mode: standard, dice: [2, 2, 2], total: 99999 });
    expect(eq).toBeNull();
  });

  it("easiestSolution returns an equation that evaluates to the target", async () => {
    const svc = new InlineSolverService();
    const eq = await svc.easiestSolution({ mode: standard, dice: [2, 3, 5], total: 10 });
    expect(eq).not.toBeNull();
    expect(eq!.total).toBe(10);
  });

  it("dispose is a no-op", () => {
    const svc = new InlineSolverService();
    expect(() => svc.dispose()).not.toThrow();
  });
});
