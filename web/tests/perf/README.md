# Perf suite

Fast, deterministic Vitest suite for render-count, MobX reactivity, and hot-path microbench regressions. Runs in happy-dom, no browser, ~1.3s wall clock.

## Run

```
cd web
npm run test:perf
```

Perf tests are excluded from the default `npm test` so this suite only runs when explicitly invoked.

## Layout

```
tests/perf/
  harness/         renderCounter (Profiler wrapper), budget (median-of-N), storeFixture
  reactivity/      MobX reaction-fire assertions across store slices
  renders/         React Profiler render-count baselines per surface
  hotpath/         Pure-JS microbenches (solver, parseEquation)
```

## What it measures (and doesn't)

- **Yes:** render counts, MobX subscription fanout, JS function-call timing, store-slice decoupling.
- **No:** real-browser paint latency, bundle size, worker round-trip time, PDF export cost, dataset-load blocking. If you care about any of these, add a new test — this harness is the wrong tool.

## Assertion style

All render-count assertions are **upper bounds** (`toBeLessThanOrEqual(observed)`). Tighten after a verified optimization win; **never loosen** to make a flaky test pass — that means the harness is wrong, not the budget.

All microbench budgets are `3× observed median`, floored at 5ms, with a comment recording the calibration date. Recalibrate on React/MobX/Vitest upgrades.

## Baselines

See [`../../../docs/perf-baseline.md`](../../../docs/perf-baseline.md) for the table of observed values and the targets noted during initial audit.

## Design notes

See [`../../../docs/plans/2026-04-19-ui-perf-harness-design.md`](../../../docs/plans/2026-04-19-ui-perf-harness-design.md) for the design decisions (why Vitest not Playwright, why render counts not ms budgets, why a separate config).
