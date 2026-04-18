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

- [PLAN-A — Phase 1: Bulk Export Pipeline](./PLAN-A-bulk-export.md)
- [PLAN-B — N2K Classic Game implementation + bots](./PLAN-B-n2k-classic-game.md)

## Future plans (not yet drafted)

- Theme schema + bundled editions (Phase 6 slice — pure data + registry, no UI)
- CLI REPL (Phase 2)
- Per-edition layout primitives audit (Phase 3 — once the web foundation lands)
