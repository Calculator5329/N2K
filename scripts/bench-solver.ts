/**
 * Solver micro-benchmark.
 *
 * Locks in a baseline before any solver refactor (B&B, canonical
 * form, inner-loop wins) so we can prove the improvements aren't
 * cheats. Runs three workloads:
 *
 *   - **standard arity-3**: tight cap, dice 2..20, target 1..999.
 *     The current daily-driver workload. ~10 (dice, target) pairs.
 *   - **aether arity-4**:    medium cap, dice -10..32 (sans 0),
 *                            target 1..5000. Currently slow enough
 *                            that the lookup spinner is visible.
 *   - **aether arity-5**:    large cap. The test that really needs
 *                            B&B / canonical pruning.
 *
 * Each workload runs `easiestSolution` and `allSolutions` for every
 * (dice, target) pair, repeating `REPEATS` times to smooth out
 * GC + JIT warmup. We report median + p95 (more meaningful than
 * mean for JIT-noisy workloads).
 *
 * Usage:
 *   npx tsx scripts/bench-solver.ts                  # full bench
 *   npx tsx scripts/bench-solver.ts --quick          # 1 repeat, smoke-test only
 *   npx tsx scripts/bench-solver.ts --baseline       # write docs/bench-baseline.md
 *
 * The --baseline flag overwrites `docs/bench-baseline.md` with a
 * Markdown table — that file is the regression check we'll diff
 * after Phase 2 changes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { AETHER_MODE, STANDARD_MODE } from "../src/core/constants.js";
import type { Mode } from "../src/core/types.js";
import { allSolutions, easiestSolution } from "../src/services/solver.js";

interface BenchCase {
  readonly label: string;
  readonly dice: readonly number[];
  readonly total: number;
}

interface Workload {
  readonly name: string;
  readonly mode: Mode;
  readonly cases: readonly BenchCase[];
  /** Whether to also run `allSolutions` (skip for arity 5 — too slow). */
  readonly runAll: boolean;
}

// --------------------------------------------------------------------
// Workloads — small & fixed so the bench is reproducible
// --------------------------------------------------------------------

const STANDARD_CASES: readonly BenchCase[] = [
  { label: "easy mid-target",    dice: [2, 3, 5],   total: 17 },
  { label: "exponent-heavy",     dice: [2, 3, 7],   total: 84 },
  { label: "no-solution",        dice: [2, 3, 5],   total: 999 },
  { label: "compound dice",      dice: [4, 8, 16],  total: 256 },
  { label: "9 depower",          dice: [9, 5, 7],   total: 110 },
  { label: "high-exp 2s",        dice: [2, 4, 8],   total: 511 },
  { label: "primes",             dice: [3, 5, 7],   total: 113 },
  { label: "tens",               dice: [10, 12, 15], total: 187 },
  { label: "deep dice",          dice: [2, 5, 20],  total: 95 },
  { label: "1024 target",        dice: [2, 8, 16],  total: 1024 % 1000 },
];

const AETHER_4_CASES: readonly BenchCase[] = [
  { label: "primes",             dice: [2, 3, 5, 7],     total: 144 },
  { label: "near-target",        dice: [2, 3, 5, 7],     total: 47 },
  { label: "neg dice",           dice: [-3, 2, 5, 7],    total: 200 },
  { label: "with 1",             dice: [1, 2, 3, 5],     total: 60 },
  { label: "high target",        dice: [2, 3, 5, 11],    total: 4321 },
  { label: "no-solution",        dice: [2, 3, 5, 7],     total: 4999 },
  { label: "dup pair",           dice: [2, 2, 5, 7],     total: 175 },
  { label: "wide range",         dice: [3, 7, 11, 13],   total: 858 },
];

const AETHER_5_CASES: readonly BenchCase[] = [
  { label: "primes",             dice: [2, 3, 5, 7, 11],   total: 3614 }, // user's example
  { label: "near-target",        dice: [2, 3, 5, 7, 11],   total: 100 },
  { label: "neg dice",           dice: [-2, 3, 5, 7, 11],  total: 1500 },
  { label: "high target",        dice: [3, 5, 7, 11, 13],  total: 4998 },
  { label: "with 1",             dice: [1, 2, 3, 5, 7],    total: 420 },
  { label: "dup pair",           dice: [2, 2, 5, 7, 11],   total: 1234 },
];

const WORKLOADS: readonly Workload[] = [
  { name: "standard arity-3", mode: STANDARD_MODE, cases: STANDARD_CASES, runAll: true },
  { name: "aether arity-4",   mode: AETHER_MODE,   cases: AETHER_4_CASES,  runAll: true },
  { name: "aether arity-5",   mode: AETHER_MODE,   cases: AETHER_5_CASES,  runAll: false },
];

// --------------------------------------------------------------------
// Stats — fixed-throwaway for warmup, then median + p95 over rest
// --------------------------------------------------------------------

interface Stats {
  readonly median: number;
  readonly p95: number;
  readonly mean: number;
  readonly samples: number;
}

function summarize(times: readonly number[]): Stats {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 1
    ? sorted[(n - 1) >> 1]!
    : (sorted[(n / 2) - 1]! + sorted[n / 2]!) / 2;
  const p95Idx = Math.min(n - 1, Math.floor(n * 0.95));
  const p95 = sorted[p95Idx]!;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  return { median, p95, mean, samples: n };
}

function fmt(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 100) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(0)}ms`;
}

// --------------------------------------------------------------------
// Bench loop
// --------------------------------------------------------------------

interface CaseResult {
  readonly label: string;
  readonly dice: readonly number[];
  readonly total: number;
  readonly easiest: Stats;
  readonly all: Stats | null;
  readonly solutionCount: number;
}

interface WorkloadResult {
  readonly name: string;
  readonly results: readonly CaseResult[];
}

function runWorkload(w: Workload, repeats: number, warmup: number): WorkloadResult {
  const results: CaseResult[] = [];
  for (const c of w.cases) {
    // warmup
    for (let i = 0; i < warmup; i += 1) {
      easiestSolution(c.dice, c.total, w.mode);
      if (w.runAll) allSolutions(c.dice, c.total, w.mode);
    }

    const easiestTimes: number[] = [];
    for (let i = 0; i < repeats; i += 1) {
      const t0 = performance.now();
      easiestSolution(c.dice, c.total, w.mode);
      easiestTimes.push(performance.now() - t0);
    }

    const allTimes: number[] = [];
    let solutionCount = 0;
    if (w.runAll) {
      for (let i = 0; i < repeats; i += 1) {
        const t0 = performance.now();
        const sols = allSolutions(c.dice, c.total, w.mode);
        allTimes.push(performance.now() - t0);
        solutionCount = sols.length;
      }
    }

    results.push({
      label: c.label,
      dice: c.dice,
      total: c.total,
      easiest: summarize(easiestTimes),
      all: w.runAll ? summarize(allTimes) : null,
      solutionCount,
    });
  }
  return { name: w.name, results };
}

// --------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------

function printConsole(rs: readonly WorkloadResult[]): void {
  for (const w of rs) {
    console.log(`\n=== ${w.name} ===`);
    console.log(
      "  case                  dice                       target  easiest(med/p95)         all(med/p95)         #sols",
    );
    for (const r of w.results) {
      const dice = `[${r.dice.join(",")}]`.padEnd(26);
      const label = r.label.padEnd(20);
      const target = String(r.total).padStart(6);
      const easy = `${fmt(r.easiest.median)} / ${fmt(r.easiest.p95)}`.padEnd(24);
      const all = r.all
        ? `${fmt(r.all.median)} / ${fmt(r.all.p95)}`.padEnd(20)
        : "(skipped)".padEnd(20);
      const sols = r.all ? String(r.solutionCount) : "-";
      console.log(`  ${label}  ${dice} ${target}  ${easy} ${all} ${sols}`);
    }
  }
}

function toMarkdown(rs: readonly WorkloadResult[], meta: { repeats: number; node: string }): string {
  const lines: string[] = [];
  lines.push("# Solver bench baseline");
  lines.push("");
  lines.push(`Generated by \`scripts/bench-solver.ts --baseline\`. Node ${meta.node}, ${meta.repeats} repeats per case (after warmup).`);
  lines.push("");
  lines.push("Numbers are reported as `median / p95` in milliseconds (or μs for sub-ms). The `#sols` column is the equation count returned by `allSolutions` — useful to spot when refactors silently drop solutions.");
  lines.push("");
  lines.push("Use this file as the regression check after each Phase 2 change. Re-run the bench, diff the table, and explain any cell that got >10% slower.");
  lines.push("");
  for (const w of rs) {
    lines.push(`## ${w.name}`);
    lines.push("");
    lines.push("| case | dice | target | easiestSolution | allSolutions | #sols |");
    lines.push("|------|------|-------:|-----------------|--------------|------:|");
    for (const r of w.results) {
      const dice = `\`[${r.dice.join(", ")}]\``;
      const easy = `${fmt(r.easiest.median)} / ${fmt(r.easiest.p95)}`;
      const all = r.all ? `${fmt(r.all.median)} / ${fmt(r.all.p95)}` : "_skipped_";
      const sols = r.all ? String(r.solutionCount) : "—";
      lines.push(`| ${r.label} | ${dice} | ${r.total} | ${easy} | ${all} | ${sols} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// --------------------------------------------------------------------
// Entry
// --------------------------------------------------------------------

function main(): void {
  const args = new Set(process.argv.slice(2));
  const quick = args.has("--quick");
  const writeBaseline = args.has("--baseline");

  // 3 repeats keeps the full bench under ~45s on the dev machine
  // while still giving a non-trivial median; --quick is for the
  // smoke test (1 repeat, no warmup) used during code changes.
  const repeats = quick ? 1 : 3;
  const warmup = quick ? 0 : 1;

  console.log(
    `Running solver bench (${repeats} repeats, ${warmup} warmup)…`,
  );
  const t0 = performance.now();
  const results = WORKLOADS.map((w) => runWorkload(w, repeats, warmup));
  const totalMs = performance.now() - t0;
  printConsole(results);
  console.log(`\nTotal bench wallclock: ${(totalMs / 1000).toFixed(2)}s`);

  if (writeBaseline) {
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, "..", "docs", "bench-baseline.md");
    mkdirSync(dirname(out), { recursive: true });
    const md = toMarkdown(results, { repeats, node: process.version });
    writeFileSync(out, md, "utf8");
    console.log(`\nWrote ${out}`);
  }
}

main();
