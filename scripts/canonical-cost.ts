/**
 * Measure the wall-clock cost of `canonicalizeSolutions` relative to
 * the `allSolutions` call that produces its input. If canonical-form
 * collapse is a meaningful fraction of total worker time we want to
 * know — the worker UI promises sub-100ms response on Standard cells
 * and we shouldn't quietly burn that budget on dedup.
 *
 * Throwaway; not wired into npm scripts.
 */
import { AETHER_MODE, STANDARD_MODE } from "../src/core/constants.js";
import type { Mode } from "../src/core/types.js";
import { canonicalizeSolutions } from "../src/services/canonicalForm.js";
import { difficultyOfEquation } from "../src/services/difficulty.js";
import { allSolutions } from "../src/services/solver.js";

interface Case {
  readonly dice: readonly number[];
  readonly target: number;
  readonly mode: Mode;
  readonly name: string;
}

const cases: readonly Case[] = [
  { dice: [2, 3, 5], target: 17, mode: STANDARD_MODE, name: "std [2,3,5]->17" },
  { dice: [2, 3, 5, 7], target: 144, mode: AETHER_MODE, name: "aether [2,3,5,7]->144" },
  { dice: [2, 3, 5, 7], target: 47, mode: AETHER_MODE, name: "aether [2,3,5,7]->47" },
  { dice: [2, 2, 5, 7], target: 175, mode: AETHER_MODE, name: "aether [2,2,5,7]->175" },
];

const REPEATS = 5;

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(2)}ms`;
}

console.log("case                          all(med)     canon(med)   canon%   raw->canon");
for (const c of cases) {
  // Warmup
  allSolutions(c.dice, c.target, c.mode);

  const allTimes: number[] = [];
  const canonTimes: number[] = [];
  let rawCount = 0;
  let canonCount = 0;
  for (let i = 0; i < REPEATS; i += 1) {
    const t0 = performance.now();
    const all = allSolutions(c.dice, c.target, c.mode);
    const t1 = performance.now();
    const canon = canonicalizeSolutions(all, (e) => difficultyOfEquation(e, c.mode));
    const t2 = performance.now();
    allTimes.push(t1 - t0);
    canonTimes.push(t2 - t1);
    rawCount = all.length;
    canonCount = canon.length;
  }

  const allMed = median(allTimes);
  const canonMed = median(canonTimes);
  const pct = ((canonMed / (allMed + canonMed)) * 100).toFixed(1);
  console.log(
    `${c.name.padEnd(28)}  ${fmt(allMed).padStart(8)}    ${fmt(canonMed).padStart(8)}    ${pct.padStart(4)}%    ${String(rawCount).padStart(4)} -> ${canonCount}`,
  );
}
