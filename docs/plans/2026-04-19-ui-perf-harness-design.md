# UI Reactivity & Performance Test Harness — Design

Date: 2026-04-19
Status: Approved, pending implementation plan

## Goal

Add a fast, deterministic Vitest-based test suite that measures UI reactivity, wasted renders, and hot-path function cost, so we can optimize without changing the look of the app in any way. Playwright-based real-browser timing is explicitly deferred.

## Non-goals

- No visual changes. JSX structure, class names, Tailwind usage, and theme tokens remain untouched.
- No real-browser paint timing (option 1 from brainstorm). May be added later.
- No ms-budget assertions on React render duration (too variance-prone in jsdom). Render *counts* are the stable proxy.
- No snapshot/visual regression testing.

## Architecture

New suite lives under `web/tests/perf/`, separate from the existing `web/tests/` so it can be excluded from the default fast run and given its own tsconfig/Vitest project if needed.

```
web/tests/perf/
  harness/
    renderCounter.ts      // wraps React <Profiler> to count renders by id
    budget.ts             // warmup + median-of-N microbench helper
    storeFixture.ts       // constructs AppStore with deterministic fixtures
  reactivity/
    playStore.reactivity.test.tsx
    composeStore.reactivity.test.tsx
  renders/
    playSurface.renders.test.tsx
    library.renders.test.tsx
  hotpath/
    solver.bench.test.ts
    urlHashCodec.bench.test.ts
```

New npm script: `npm run test:perf`. Default `npm test` continues to exclude perf tests.

## Test categories

### 1. Render-count tests (reactivity fanout + wasted renders)

Render the real component tree inside `<Profiler id="…" onRender={count}>`. Fire a store mutation (e.g. `play.knockCell(3,4)`). Assert:

- The clicked cell re-renders exactly once.
- Sibling cells re-render zero times.
- Scoreboard re-renders once.
- Unrelated top-level panels re-render zero times.

Catches regressions where a `useAppStore()` consumer accidentally subscribes to a coarse slice, or a missing `observer` wrap causes a parent cascade.

### 2. Hot-path microbenches (pure JS)

Warmup 5 iterations, then measure the median of 21. Assert median < budget. Budgets calibrated from one initial run × 3 for headroom against variance. Targets:

- `easiestSolution` / solver hot path
- `parseEquation`
- generator dice enumeration
- `compressedHashCodec` encode/decode

### 3. Store-slice reactivity tests (MobX)

Use `mobx.autorun` or `reaction` to count observer fires for a given derivation when an *unrelated* field changes. For example, mutate `theme.edition` and assert a `play.score` reaction fires zero times. This verifies store boundaries at the MobX level, independent of React.

## Optimization workflow

Once the baseline is green:

1. Run `npm run test:perf` → record baseline render counts & microbench medians.
2. Apply one optimization at a time.
3. Re-run. Tests either pass tighter assertions (we then ratchet the assertion down) or reveal a regression.

**Candidates we will look for** (subscription / memoization shape only, no visual touching):

- Missing `observer` wraps that let parent re-renders cascade into children
- `useAppStore()` destructuring that subscribes to the whole root store
- Inline object / array literals passed to memoized children
- Non-memoized derived arrays (`.map`, `.filter`) in render
- MobX `computed` opportunities on getters hit every render

Explicitly excluded: JSX structure changes, CSS/Tailwind changes, className changes, theme token changes.

## Constraint: keep the codebase legible

The user's stated preference: **don't make the codebase crazy.** If a given optimization requires meaningful new plumbing (e.g. a dedicated reactive selector layer, a memoization utility, a render-gating HOC), it goes in an **additive, sectioned-off module** rather than being sprinkled through cleanly-written existing code.

Operational rule: prefer subscribe-narrower / wrap-in-`observer` fixes in-place (these are minor and local). Any larger mechanism (e.g. a `selector(store, fn)` helper, a memoized list renderer) lives in its own new file under `web/src/ui/perf/` or similar, with a short README noting it is an opt-in add-on. Existing components only gain a single import line at most; their bodies are not rewritten for performance.

## Risk / variance notes

- jsdom timings vary; microbench budgets use median-of-N and generous headroom.
- React's batching means single mutations may legitimately produce 1 render per observer; tests assert *upper bounds*, not exact equality, except where we want to pin a specific regression.
- We accept that render-count tests can be brittle across React/MobX upgrades; the fix on upgrade is to re-baseline, not to weaken.

## Follow-ups (deferred)

- Playwright + CDP based real-browser latency harness for click-to-paint and worker round-trip flows.
- Bundle-size budget test.
- React render *duration* budgets once we have CI with stable perf runners.
