# Agent plans

Self-contained, well-scoped work streams that can run in parallel with each other and with the main agent.

## Coordination rules

Every plan in this folder MUST:

1. **Declare its file boundary up front** — exact paths it WILL touch and exact paths it MUST NOT touch.
2. **Run in its own git branch** named `agent/<plan-id>` (e.g. `agent/phase-1-export`). The plan owner branches from `main`, lands on `main` via PR.
3. **Add its own tests under `tests/`** with file names that don't collide with existing tests.
4. **Update `docs/changelog.md` and `docs/roadmap.md`** in its merge PR (not in incremental commits — to avoid merge churn).
5. **NOT modify** `package.json` dependencies without coordinating in the PR description (npm install conflicts otherwise).
6. **NOT modify** any file under `src/core/` or any existing file under `src/services/` unless the plan explicitly says so. Foundation modules are stable.

## Active plans

| Plan | Branch | Folder boundary | Status |
|------|--------|-----------------|--------|
| [PLAN-A — Phase 1: Bulk Export Pipeline](./PLAN-A-bulk-export.md) | `agent/phase-1-export` | `src/core/n2kBinary.ts`, `src/services/exporter*.ts`, `src/services/workerPool.ts`, `scripts/export.ts`, related tests | in progress |
| [PLAN-B — N2K Classic Game implementation + bots](./PLAN-B-n2k-classic-game.md) | `agent/games-n2k-classic` | `src/games/`, `tests/games/` | in progress |
| [PLAN-C — Theme registry as data + bundled editions](./PLAN-C-themes-as-data.md) | `agent/themes-as-data` | `src/themes/`, `tests/themes/` | available |
| [PLAN-D — Phase 2 CLI REPL](./PLAN-D-cli-repl.md) | `agent/phase-2-cli` | `src/cli/`, `tests/cli/` | available |
| [PLAN-E — Difficulty parity & calibration harness](./PLAN-E-difficulty-parity.md) | `agent/difficulty-parity` | `src/calibration/`, `scripts/calibration/`, `fixtures/`, `docs/calibration/` | available |

Phase 3 (web foundation) is on `agent/phase-3-web` and owned by the parent agent — DO NOT modify `web/` from any of the plans above.

## Conflict map

The plans were chosen so that no two plans write to the same path:

```
src/core/n2kBinary.ts ........ A
src/services/exporter*.ts .... A
src/services/workerPool.ts ... A
scripts/export.ts ............ A
src/games/ ................... B
src/themes/ .................. C
src/cli/ ..................... D
src/calibration/ ............. E
scripts/calibration/ ......... E
fixtures/ .................... E
docs/calibration/ ............ E
web/ ......................... (parent agent — phase-3-web)
```

Shared files (each plan touches its own section, additive only):

- `package.json` — every plan may add a script entry. Avoid version bumps to existing deps. New deps require coordinating in the PR description.
- `tsconfig.json` — every plan may add to `include`. Avoid changing `compilerOptions`.
- `docs/changelog.md` — append-only, newest first; coordinate via PR review (rebases are cheap on a changelog).
- `docs/roadmap.md` — checkboxes only, never restructuring.

## Future plans (not yet drafted)

- Solver perf benchmark suite (`bench/` — track regressions, find hot-path opportunities)
- Custom dice / operators contract (architecture sketch for the user-content vision)
- Per-edition layout primitives audit (waits until Phase 3 web foundation lands and is merged)
- Mode preset extension framework (`src/core/modeRegistry.ts`)
