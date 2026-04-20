# UI Reactivity & Performance Test Harness — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up a fast, deterministic Vitest-based perf suite in `web/tests/perf/` covering render counts, MobX reactivity fanout, and hot-path microbenches, then use it to drive optimizations without any visual changes.

**Architecture:** Separate Vitest config (`vitest.perf.config.ts`) so perf tests run via a dedicated `npm run test:perf` and are excluded from the default `npm test`. A tiny harness (`Profiler` wrapper, median-of-N timer, store fixture) backs three categories of tests: render-count, MobX reactivity, and pure-JS hot-path benches. Optimizations land in small follow-up commits; any non-trivial mechanism goes in a new `web/src/ui/perf/` module rather than rewriting existing cleanly-written components.

**Tech Stack:** Vitest 2 + happy-dom (existing), React 18 `<Profiler>`, MobX 6 `reaction`/`autorun`, `react-dom/client` for direct root mount (no new deps).

**Design reference:** [docs/plans/2026-04-19-ui-perf-harness-design.md](./2026-04-19-ui-perf-harness-design.md)

**Constraint (user-stated):** Do not "make the codebase crazy." Prefer in-place, minimal fixes (wrap in `observer`, narrow a subscription). Anything larger (selector helper, render gate) lives in a new additive module.

---

## Task 1: Scaffold the perf suite config

**Files:**
- Create: `web/vitest.perf.config.ts`
- Modify: `web/vitest.config.ts` (add `exclude` for `tests/perf/**`)
- Modify: `web/package.json` (add `test:perf` script)
- Create: `web/tests/perf/.gitkeep`

**Step 1: Add perf vitest config**

Create `web/vitest.perf.config.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@platform": path.resolve(__dirname, "../src"),
      "@solver": path.resolve(__dirname, "../src"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/perf/**/*.test.ts", "tests/perf/**/*.test.tsx"],
    // Perf tests are order-sensitive and timing-sensitive;
    // keep them single-threaded and isolated.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
```

**Step 2: Exclude perf from default run**

In `web/vitest.config.ts`, under `test`, add:

```ts
exclude: ["node_modules/**", "dist/**", "tests/perf/**"],
```

**Step 3: Add npm script**

In `web/package.json` scripts, add:

```json
"test:perf": "vitest run -c vitest.perf.config.ts"
```

**Step 4: Placeholder so the directory exists**

Create empty `web/tests/perf/.gitkeep`.

**Step 5: Verify default suite still passes and perf suite is empty-but-valid**

Run (from `web/`): `npm test`
Expected: existing suite green, unchanged count.

Run: `npm run test:perf`
Expected: "No test files found" — acceptable at this point (exit code 1). We'll have real tests in the next tasks; no commit failure risk because we haven't committed yet.

**Step 6: Commit**

```bash
git add web/vitest.perf.config.ts web/vitest.config.ts web/package.json web/tests/perf/.gitkeep
git commit -m "test(perf): scaffold perf suite config and npm script"
```

---

## Task 2: Harness — median-of-N microbench helper

**Files:**
- Create: `web/tests/perf/harness/budget.ts`
- Create: `web/tests/perf/harness/__tests__/budget.test.ts`

**Step 1: Write failing test**

`web/tests/perf/harness/__tests__/budget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { medianMs } from "../budget.js";

describe("medianMs", () => {
  it("returns the median wall-clock cost of the fn across N samples after warmup", () => {
    let calls = 0;
    const result = medianMs(() => { calls++; }, { warmup: 2, samples: 5 });
    expect(calls).toBe(7); // 2 warmup + 5 measured
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("accepts a budget assertion helper", () => {
    // constant-time trivial fn; should comfortably fit a 10ms budget
    const fn = () => { let x = 0; for (let i = 0; i < 100; i++) x += i; return x; };
    const median = medianMs(fn, { warmup: 3, samples: 11 });
    expect(median).toBeLessThan(10);
  });
});
```

**Step 2: Run — expect fail** (`npm run test:perf`) — "Cannot find module '../budget.js'".

**Step 3: Implement**

`web/tests/perf/harness/budget.ts`:

```ts
export interface MedianOptions {
  warmup: number;
  samples: number;
}

export function medianMs(fn: () => unknown, opts: MedianOptions): number {
  for (let i = 0; i < opts.warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < opts.samples; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}
```

**Step 4: Run — expect pass**

**Step 5: Commit**

```bash
git add web/tests/perf/harness/budget.ts web/tests/perf/harness/__tests__/budget.test.ts
git commit -m "test(perf): add medianMs microbench helper"
```

---

## Task 3: Harness — render counter via React Profiler

**Files:**
- Create: `web/tests/perf/harness/renderCounter.tsx`
- Create: `web/tests/perf/harness/__tests__/renderCounter.test.tsx`

**Step 1: Write failing test**

`web/tests/perf/harness/__tests__/renderCounter.test.tsx`:

```tsx
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CountProfiler, createRenderCounter } from "../renderCounter.js";

describe("renderCounter", () => {
  it("counts renders per profiler id", async () => {
    const counter = createRenderCounter();

    let setN: (n: number) => void = () => {};
    function Inner() {
      const [n, set] = useState(0);
      setN = set;
      return (
        <CountProfiler id="inner" counter={counter}>
          <span>{n}</span>
        </CountProfiler>
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => { root.render(<Inner />); });
    expect(counter.get("inner")).toBe(1); // mount

    await act(async () => { setN(1); });
    expect(counter.get("inner")).toBe(2); // one update

    await act(async () => { root.unmount(); });
  });
});
```

**Step 2: Run — expect fail**

**Step 3: Implement**

`web/tests/perf/harness/renderCounter.tsx`:

```tsx
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

export interface RenderCounter {
  get(id: string): number;
  reset(id?: string): void;
  record: ProfilerOnRenderCallback;
}

export function createRenderCounter(): RenderCounter {
  const counts = new Map<string, number>();
  const record: ProfilerOnRenderCallback = (id) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  return {
    get: (id) => counts.get(id) ?? 0,
    reset: (id) => { if (id) counts.delete(id); else counts.clear(); },
    record,
  };
}

export function CountProfiler({
  id, counter, children,
}: { id: string; counter: RenderCounter; children: ReactNode }) {
  return <Profiler id={id} onRender={counter.record}>{children}</Profiler>;
}
```

**Step 4: Run — expect pass**

**Step 5: Commit**

```bash
git add web/tests/perf/harness/renderCounter.tsx web/tests/perf/harness/__tests__/renderCounter.test.tsx
git commit -m "test(perf): add React Profiler render-counter harness"
```

---

## Task 4: Hot-path microbench — solver `easiestSolution`

**Files:**
- Create: `web/tests/perf/hotpath/solver.bench.test.ts`

**Note on budgets:** Treat the first local run as the calibration run. Set assertion to `median * 3` to give headroom. Record the calibrated number in a comment at the top of the file so future changes have a reference.

**Step 1: Write test that calls and measures**

```ts
import { describe, expect, it } from "vitest";
import { easiestSolution } from "@platform/services/solver.js";
import { STANDARD_MODE } from "@platform/core/constants.js";
import { medianMs } from "../harness/budget.js";

// Calibrated 2026-04-19 local: median ~X.Xms. Budget = 3× headroom.
const BUDGET_MS = 15;

describe("hot-path: solver.easiestSolution", () => {
  it("solves a representative triple under budget", () => {
    const dice: [number, number, number] = [4, 7, 12];
    const target = 22;
    const run = () => easiestSolution(dice, target, STANDARD_MODE);
    // Sanity: solvable
    expect(run()).toBeTruthy();
    const median = medianMs(run, { warmup: 5, samples: 21 });
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
```

**Step 2: Run (`npm run test:perf`) — record actual median**

If test passes, note the median by temporarily logging `console.log(median)` and then update `BUDGET_MS` to `Math.ceil(median * 3)` with a reasonable floor of 5ms.

**Step 3: Remove the debug log, re-run, expect pass**

**Step 4: Commit**

```bash
git add web/tests/perf/hotpath/solver.bench.test.ts
git commit -m "test(perf): add solver hot-path microbench"
```

---

## Task 5: Hot-path microbench — parseEquation

**Files:**
- Create: `web/tests/perf/hotpath/parseEquation.bench.test.ts`

Mirror Task 4 structure. Use a small representative set of equation strings covering operator mix. Calibrate and commit.

```ts
import { describe, expect, it } from "vitest";
import { parseEquation } from "@platform/services/parsing.js";
import { medianMs } from "../harness/budget.js";

const EQ = "4 + 7 * 2";
const BUDGET_MS = 2; // recalibrate on first run

describe("hot-path: parseEquation", () => {
  it("parses a simple equation under budget", () => {
    const run = () => parseEquation(EQ);
    expect(run()).toBeTruthy();
    const median = medianMs(run, { warmup: 5, samples: 21 });
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
```

Verify `parseEquation` signature in `src/services/parsing.ts` before writing; adjust import/args to match. Calibrate, commit: `test(perf): add parseEquation hot-path microbench`.

---

## Task 6: MobX reactivity — unrelated-slice fanout

**Files:**
- Create: `web/tests/perf/reactivity/storeFanout.test.ts`
- Create: `web/tests/perf/harness/storeFixture.ts`

**Step 1: Build fixture**

`web/tests/perf/harness/storeFixture.ts`:

```ts
import { AppStore } from "../../../src/stores/AppStore.js";

export function buildTestAppStore(): AppStore {
  return new AppStore();
}
```

(If `AppStore` constructor takes args or performs side effects, inspect `src/stores/AppStore.ts` and pass test doubles as needed. Keep the fixture boring and synchronous.)

**Step 2: Write reactivity test**

```ts
import { reaction } from "mobx";
import { describe, expect, it, afterEach } from "vitest";
import { buildTestAppStore } from "../harness/storeFixture.js";

describe("store reactivity fanout", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => { dispose?.(); dispose = undefined; });

  it("theme changes do not fire play.status reactions", () => {
    const store = buildTestAppStore();
    let fires = 0;
    dispose = reaction(() => store.play.status, () => { fires++; });

    store.theme.setEdition?.("noir"); // or whatever the real setter is
    // If setEdition doesn't exist, use the actual API; check ThemeStore.

    expect(fires).toBe(0);
  });
});
```

**Step 3: Resolve store APIs**

Read `web/src/stores/ThemeStore.ts` and `PlayStore.ts` and fix the mutator name + use a theme edition that exists. Remove the `?.` once the API is known.

**Step 4: Run — expect pass; if it fails, we've found our first optimization opportunity.** In that case, do NOT fix it in this task — leave the test failing-in-intent and instead make the assertion tolerant (`toBeLessThanOrEqual(fires)` with the current count) and file a follow-up note in the test comment. Task 9 handles optimizations.

**Step 5: Commit**

```bash
git add web/tests/perf/reactivity/storeFanout.test.ts web/tests/perf/harness/storeFixture.ts
git commit -m "test(perf): add MobX reactivity fanout test for unrelated store slices"
```

---

## Task 7: Render-count test — PlayView knockCell fanout

**Files:**
- Create: `web/tests/perf/renders/playView.renders.test.tsx`

**Step 1: Read PlayView to find a stable seam**

Inspect `web/src/features/play/PlayView.tsx`. Identify:
- Top-level observer names (e.g. `RaceScreen`, `SetupScreen`).
- The board cell component (likely an inner observer).
- The scoreboard/score display component.

**Step 2: Write the test**

Pseudocode shape (adapt to actual components found):

```tsx
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { AppStoreContext } from "../../../src/stores/AppStoreContext.js";
import { PlayView } from "../../../src/features/play/PlayView.js";
import { buildTestAppStore } from "../harness/storeFixture.js";
import { CountProfiler, createRenderCounter } from "../harness/renderCounter.js";

describe("PlayView render counts", () => {
  it("knocking a cell does not re-render the entire board", async () => {
    const store = buildTestAppStore();
    // Put store into racing state with known dice so a specific cell is knockable.
    store.play.start();               // adjust to real setup API
    // Force-seed dice / target to guarantee cell (r,c) is reachable.
    // (Use test-only getters; do NOT add production APIs for this.)

    const counter = createRenderCounter();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppStoreContext.Provider value={store}>
          <CountProfiler id="play" counter={counter}>
            <PlayView />
          </CountProfiler>
        </AppStoreContext.Provider>,
      );
    });
    counter.reset();

    await act(async () => { store.play.knockCell(3, 4); });

    // Upper-bound assertion: knocking one cell must not re-render the whole PlayView subtree more than a handful of times.
    expect(counter.get("play")).toBeLessThanOrEqual(3);

    await act(async () => { root.unmount(); });
  });
});
```

**Step 3: Run**

Likely outcomes:
- Passes with 1–3 → good baseline.
- Passes with a high number → tighten the cap in Task 9 after optimizing.
- Fails (too many renders) → keep the current count as baseline ceiling for now; Task 9 ratchets it down.

Adjust the assertion to match current baseline + 0 headroom so regressions fail.

**Step 4: Commit**

```bash
git add web/tests/perf/renders/playView.renders.test.tsx
git commit -m "test(perf): add PlayView render-count baseline for knockCell"
```

---

## Task 8: Document baselines

**Files:**
- Create: `docs/perf-baseline.md`

**Step 1: Run full perf suite with verbose timing**

`cd web && npm run test:perf`

**Step 2: Record baselines**

In `docs/perf-baseline.md`, table of:
- Microbench medians (solver, parseEquation) with date and machine note.
- Render-count ceilings per test id.
- The current assertion caps.

**Step 3: Commit**

```bash
git add docs/perf-baseline.md
git commit -m "docs(perf): record initial perf suite baselines"
```

---

## Task 9: Iterate — one optimization at a time

This task is a loop, not a single change. For each candidate:

**Loop:**

1. Pick one candidate from the design-doc list (missing `observer`, coarse `useAppStore` subscription, inline literal to memoized child, non-memoized derived array, `computed` opportunity).
2. Re-run `npm run test:perf` and record numbers before change.
3. Apply the minimal in-place change.
   - If the change is a one-liner (wrap in `observer`, narrow destructuring, hoist a literal) → edit in place.
   - If the change requires meaningful new mechanism → create a new file under `web/src/ui/perf/` (e.g. `web/src/ui/perf/selector.ts`), export cleanly, and import with one line at the call site. Do NOT rewrite existing component bodies for perf.
4. Re-run perf suite. If numbers improved, tighten the affected assertion to the new baseline + 0 headroom.
5. Run full test suite (`npm test` and `npm run test:perf`) — must be green, and zero visual changes (no JSX/className/CSS edits).
6. Commit with a message like `perf(play): wrap Cell in observer to stop board-wide re-render`.
7. Update `docs/perf-baseline.md` if a headline number moved.

**Stop condition:** No candidate yields a measurable improvement on two consecutive attempts, or the user says stop.

**Constraints enforced every iteration:**
- No changes to JSX structure, class names, Tailwind classes, inline styles, or theme tokens.
- No changes to `src/` outside of subscription shape or memoization unless adding a new `web/src/ui/perf/` file.
- No removal of comments or doc blocks.

---

## Task 10: README / pointer

**Files:**
- Modify: `docs/architecture.md` (one-paragraph reference to the perf suite) OR
- Create: `web/tests/perf/README.md`

Short note: what's here, how to run, what NOT to use it for (ms-budget-on-renders), how to re-baseline.

Commit: `docs(perf): document perf suite entry point`.

---

## Execution notes

- Frequent commits — every task above is its own commit.
- If any task reveals that an existing API doesn't exist as assumed (e.g. `setEdition`), fix the plan by reading the actual source and adapt the test; don't add production APIs just to make tests work.
- If `happy-dom` causes flake in Profiler tests, switch only the perf config to `"jsdom"` (already a transitive dep via `@vitejs/plugin-react` tooling; add `jsdom` as devDep if needed).
- Keep the perf suite deterministic: no `Math.random`, no real timers. If PlayStore uses `setInterval` for its race timer, inject fake timers via `vi.useFakeTimers()` in the affected tests.
