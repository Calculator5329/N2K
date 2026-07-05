# CLAUDE.md — N2K-v3 (N2K Platform)

Mental-math dice-equation game site. **This code is LIVE** at
n2k-almanac-v3.web.app (Firebase Hosting, project `ethan-488900`;
portfolio notes call the product mentalmath.site — verify any custom
domain in the Firebase console, it is not in this repo). Static React
SPA + precomputed `.n2k` datasets; no server; all user data is
localStorage. This repo is the sole survivor of ~11 N2K repos — never
develop in the sibling folders under `..\`.

## Read first

- `docs/architecture.md` — what it is, layers, dataset format,
  exact commands, known limitations.
- `docs/roadmap.md` — Now/Next/Later handoff plan + queued streams.
- `docs/IDEAS.md` — ranked expansion backlog.
- `docs/changelog.md` — session log, newest first (append when you
  ship something).
- `docs/perf-baseline.md` — perf budgets and how to re-baseline.

## Verify before every commit

Two npm roots (repo root and `web/`); run both sides:

```bash
# root workspace (solver/CLI/games) — ~100s, 300+ tests
npm run typecheck
npm test

# web app
cd web
npm run typecheck
npm test
npm run test:perf
```

All green as of 2026-07-05 (root 304 tests / 23 files; web 72 / 9;
perf suite separate). If you touched web UI at multiple breakpoints,
also run `cd web && npm run test:e2e` (Playwright; browsers must be
installed via `npx playwright install`).

## Deploy — only after the full verify above passes

```bash
cd web && npm run build && cd ..
firebase deploy --only hosting:almanac
```

Deploy from the **repo root** (`firebase.json` is there; the README's
`cd web` deploy instruction is wrong about the directory). Never
deploy with failing tests or typecheck. After deploying, smoke-test
the live URL: Lookup answers a query, Play finishes a race.

## Hard rules

1. **Never break the live site.** Build + full test pass before
   `firebase deploy`. When in doubt, don't deploy — commits are cheap,
   outages aren't.
2. **User-data integrity (localStorage).** Persisted schemas are
   versioned (`SharedPlanV5` plans, `match:current` snapshot v2,
   `stats:{compId}` records, `n2k.theme`). Never change a persisted
   shape without a migration path from every older version — v1..v4
   plans already migrate transparently; keep that property. Breaking
   a returning player's saved competitions is a sev-1.
3. **Perf budgets are load-bearing.** `web/tests/perf` caps may be
   tightened after verified wins, **never loosened** to pass a flaky
   run (see `docs/perf-baseline.md`).
4. **Don't regenerate `.n2k` blobs casually.** They are expensive bake
   outputs (arity-4 commons ≈ hours; full arity-5 ≈ 21 h) and are
   served with immutable cache headers. Don't delete, and don't rebake
   without being asked.
5. **Never touch the sibling legacy repos** (`..\N2K-v2`, `..\n2k-ui`,
   `..\N2K-almanac`, `..\N2K-ComprehensiveSolver`, `..\backups`).
   Archival/consolidation is a user-approval task in the roadmap.
6. **No secrets in the repo or docs.** There are currently none
   checked in; keep it that way (future Firestore/AI work must keep
   keys server-side or in untracked env files).
7. **Respect the layer rules.** UI → stores → services → core, one
   way. Services stay pure (no MobX, no DOM); core has zero runtime
   deps; features never import each other.

## Architecture cheat-sheet

- Root workspace `src/` = Node solver/CLI/games; `web/` = Vite SPA;
  each has its own `package.json` + `npm install`.
- Mode is data (`STANDARD_MODE` / `AETHER_MODE` in
  `src/core/constants.ts`); one solver, one difficulty heuristic.
- Datasets: `web/public/data/*.n2k` (standard ~1 MB eager;
  aether-arity3 ~31 MB lazy; arity-4/5 "commons" partial; misses fall
  back to a Web Worker solver pool).
- Persistence: `LocalStorageContentBackend` behind the
  `ContentBackend` interface (`web/src/services/contentBackend.ts`) —
  the designed seam for a future Firestore swap.
- Games: `Game<>` kernel (`src/services/gameKernel.ts`); `n2kClassic`
  is the only registered game; bots in `src/games/`.
- Æther mode is Konami-unlocked on the web, `--mode aether` in the CLI.

## Definition of done

A change is done when: (1) root + web typecheck and tests pass,
perf suite included; (2) new behavior has a test; (3) persisted-schema
changes migrate from all prior versions; (4) `docs/changelog.md` has
an entry and any affected doc (`architecture.md` / `roadmap.md`) is
updated; (5) if user-facing and worth shipping, it is deployed per the
deploy steps and smoke-tested live — otherwise explicitly left
undeployed and noted.
