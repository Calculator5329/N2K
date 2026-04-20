# Perf Suite Baselines

Run via `cd web && npm run test:perf`. Total suite ~1.3s wall clock.

## Baselines — 2026-04-19 (local Windows 11, Opus-driven session)

### Hot-path microbenches (median of 21, 5 warmup)

| Bench | Observed median | Assertion budget | Headroom |
|---|---|---|---|
| `easiestSolution([2,3,5], 11, STANDARD)` | ~1.42 ms | < 5 ms | 3.5× |
| `parseEquation("2^3 + 3 * 5 = 23")` | ~0.002 ms | < 5 ms | (floor) |

### React render counts

| Profiler id | Scenario | Observed | Cap |
|---|---|---|---|
| `play-view` | enter racing → knock cell 0 | 1 | ≤ 1 |

Note: the `play-view` count of 1 reflects that the top-level `PlayView` observer does NOT re-render on a knock — the fanout is into descendants (`BoardGrid`, `BoardCell`, `ScoreLine`), each of which owns its own MobX subscription. This baseline is a regression net for the top level; per-descendant measurements will land in Task 9 as we add targeted optimizations.

### MobX reactivity fanout

| Mutation | Observer | Fires |
|---|---|---|
| `theme.setTheme(nextEdition)` | `reaction(() => play.status)` | 0 |

The two slices are cleanly decoupled — this is the spec compliance baseline.

## Optimization targets noted during Task 7

Recorded here so Task 9 has a starting point. None of these have been addressed yet.

1. **`playerKnockedSet` / `botKnockedSet` rebuilt as new `Set` per access** — when a knock mutates `playerKnocked`, the derived set identity changes, which can fan out into all 36 `BoardCell` observers that call `.has(idx)` on it. Candidate: maintain the set incrementally alongside the array, or switch to a MobX `observable.set`.
2. **Unused `useAppStore()` in `BoardCell`** — dropping the unused context read removes an unnecessary subscription per cell (36 cells × 2 boards = 72 observers potentially pared back).
3. **`cells.map(...)` inline in `BoardGrid`** — creates fresh child nodes each commit; memoising keyed on `boardCells` identity would avoid re-creation when only the knocked-set changed.
4. **`ScoreLine` reduce** — recomputes on every knock. Minor given 36 cells, but could be a MobX `computed`.

## Re-baselining

If React / MobX / Vitest are upgraded, or the app's subscription shape is deliberately changed, re-run `npm run test:perf`, update this table, and update any affected `expect(...).toBeLessThanOrEqual(...)` caps. The rule is **tighten caps after optimization wins, do not loosen caps to make flaky tests pass** — flakes mean the harness is wrong, not the budget.
