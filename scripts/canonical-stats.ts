/**
 * Quick one-shot to measure how much `canonicalizeSolutions` shrinks
 * a real `allSolutions` output across representative workloads.
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
  { dice: [1, 2, 3, 5], target: 60, mode: AETHER_MODE, name: "aether [1,2,3,5]->60" },
  { dice: [2, 2, 5, 7], target: 175, mode: AETHER_MODE, name: "aether [2,2,5,7]->175" },
];

for (const c of cases) {
  const all = allSolutions(c.dice, c.target, c.mode);
  const canon = canonicalizeSolutions(all, (e) => difficultyOfEquation(e, c.mode));
  const ratio = (all.length / Math.max(1, canon.length)).toFixed(2);
  console.log(
    `${c.name.padEnd(28)} all=${String(all.length).padStart(5)} canonical=${String(canon.length).padStart(4)} ratio=${ratio}x`,
  );
}
