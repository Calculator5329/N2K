# N2K Platform — Architecture

## What this is (handoff summary)

N2K-v3 ("N2K Platform", package `n2k-platform`) is a mental-math /
dice-equation training and game site. Players pick dice and a target
and find equations of the form `d1^p1 op1 d2^p2 op2 d3^p3 = total`
(evaluated strictly left-to-right); the site can look up the easiest
equation for any roll, build and export multi-board competitions, and
run 60-second knockout races against bot personas. It is a static
React SPA backed by precomputed bit-packed `.n2k` datasets — there is
**no server**; all persistence is local-first (localStorage).

This repo is the **sole survivor of ~11 historical N2K repos**. Legacy
siblings (`N2K-v2`, `n2k-ui`, `N2K-almanac`, `N2K-ComprehensiveSolver`,
`backups/`) sit in the parent folder `..\` and are frozen — some have
broken `.git` dirs. Do not develop in them. Background on the v2→v3
rewrite lives in `..\v2-vs-v3-context.md` (note: that file predates
the v3.1 prune, so its surface inventory is stale; this repo's docs
are authoritative).

**Deployment identity:** Firebase Hosting, project `ethan-488900`,
hosting target `almanac`, live at
[n2k-almanac-v3.web.app](https://n2k-almanac-v3.web.app). Portfolio
notes refer to the product as **mentalmath.site** — that domain does
not appear anywhere in this repo; if it is live it is a custom domain
mapped in the Firebase console. Verify there before relying on it.

**What does NOT exist yet (despite portfolio shorthand):** no global
leaderboards, no user profiles, no accounts, no analytics. Identity
and persistence seams (`ContentBackend`) exist so these can be added
without rearchitecting — see `docs/ROADMAP.md` and `docs/IDEAS.md`.

## Layered model

```
┌──────────────────────────────────────────────────────────────┐
│                            UI                                │
│  CLI REPL (src/cli)            Web app (web/src/features)    │
│                                Chrome  (web/src/ui/chrome)   │
│                                Primitives (web/src/ui/...)   │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                          STORES                              │
│  src/cli (REPL state)                                        │
│  web/src/stores  (AppStore root + DataStore, AetherDataStore,│
│                   ThemeStore, FavoritesStore, SecretStore,   │
│                   PlayStore, useAlmanacIndex hook)           │
│  feature stores  (LookupStore, AetherLookupStore,            │
│                   CompositionStore — colocated with views)   │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                         SERVICES                             │
│  src/services    (solver, difficulty, gameKernel, parsing,   │
│                   arithmetic, generators, competition,       │
│                   exporter + workerPool)                     │
│  web/src/services (n2kLoader, datasetService, contentBackend,│
│                    competitionService, candidatePools,       │
│                    aetherSolver(Service|Worker), aetherSample│
│                    competitionExport(+Pdf), urlHashState,    │
│                    compressedHashCodec, solverWorker(Service)│
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                           CORE                               │
│  src/core      (types, constants, n2kBinary, n2kBlob)        │
│  web/src/core  (themes registry, web-only types)             │
└──────────────────────────────────────────────────────────────┘
```

Strict one-way dependencies. UI observes stores and dispatches
actions; stores orchestrate services; services are pure and stateless;
core has zero runtime deps. There is **one** root store (`AppStore`)
reached through **one** hook (`useAppStore`), surfaced from
`stores/AppStoreContext.tsx`.

## The single domain

There is exactly one equation type, one solver, one difficulty heuristic. Mode is data, not code:

```ts
export interface Mode {
  readonly id: "standard" | "aether" | "custom";
  readonly diceRange: { readonly min: number; readonly max: number };
  readonly targetRange: { readonly min: number; readonly max: number };
  readonly arities: readonly Arity[];
  readonly depower: boolean;
  readonly safeMagnitude: number;
}

export const STANDARD_MODE: Mode;
export const AETHER_MODE: Mode;
```

The solver accepts a `Mode` and a dice tuple, returns `NEquation`s. Standard-mode-only behaviors (compound-dice depower, narrower exponent caps) are toggled by the mode, not by a separate code path.

## Game kernel

```ts
interface Game<TConfig, TState, TMove> {
  init(config, players): TState;
  legalMoves(state, player): readonly TMove[];
  applyMove(state, move, byPlayer): TState;
  isTerminal(state): boolean;
  score(state): Record<PlayerId, number>;
  serialize(state): unknown;
  deserialize(raw): TState;
}

interface Player {
  id: PlayerId;
  pickMove(state, legal): Promise<unknown>;
}
```

The game state must be serializable and `applyMove` must be pure. Replays = `(initialState, moveLog)`. Multiplayer would slot in as a different `Player` impl over a network transport. Minigames register the same way.

## Themes

The active theme system is a typed registry in `web/src/core/themes.ts`:

```ts
export type ThemeId = "almanac" | "phosphor" | "broadsheet" | …;  // 17 ids
export type LayoutId = "sidebar" | "topbar" | "manuscript" | …;   // 12 layouts

interface Theme {
  id: ThemeId;
  label: string;
  tagline: string;
  swatches: readonly string[];
  layout: LayoutId;
  variants: { dice: DiceGlyphStyle; equation: EquationStyle };
  ornaments: ThemeOrnaments;
  scale: { stops: readonly ScaleStop[]; impossible: RGB };
}

export const THEMES: Record<ThemeId, Theme>;
export const DEFAULT_THEME: ThemeId = "tabletop";
```

Each theme picks one of 12 layout primitives in
`web/src/ui/chrome/layouts/`. Visual styling lives in
`web/src/styles.css` keyed off `[data-theme="<id>"]`. The Æther
unlock layers a violet vignette on top via `[data-aether="1"]` —
orthogonal to theme.

## Public surfaces (v3.2)

The web app ships a **single feature tree** rooted at `web/src/features/`
with **four** top-level surfaces routed via `AppStore.view`:

```
features/lookup/    # Pick dice + target → easiest equation     (folio I)
features/compose/   # Phases · boards · bouts · balanced rolls  (folio II, label "Competition")
features/library/   # Saved competitions + match history        (folio III)
features/match/     # In-flight competition match (race chain)  (folio IV — shares route with Quick Race)
features/play/      # 60s knockout race vs a bot                (folio IV, fallback when no match loaded)
```

`PlayRoute` in `App.tsx` picks `MatchView` when `appStore.match !== null`
and falls back to `PlayView` (Quick Race) otherwise. Nav lives in
`ui/chrome/nav.ts` and emits I / II / III / IV.

### Competition data model (v3.2)

```
Competition  (`SharedPlanV5`, persisted under compose:saved:{uuid})
  └── name, rules, pool, timeBudget, seed, spice, variance
  └── Phases  (`PhaseConfig[]`, default 1 phase)
        └── Boards  (`BoardConfig[]`, 6×6 grid + bout count)
              └── Bouts  (one P1/P2 dice pair, played as a 60s race)
```

`MatchStore` flattens the comp tree into a `ScheduleEntry[]` (one
per race in vs-bot, two per bout in hot-seat). Each entry carries
its phase / board / bout indices, the 36-cell board, and the dice
for both seats. The store walks the schedule one entry at a time,
re-using a single `PlayStore` instance for every race.

Stats live in their own namespace (`stats:{compId}`) — kept separate
from the comp body so the autosave write stays small even after
hundreds of recorded matches. In-flight matches mirror to
`match:current` (snapshot v2; v1 falls back to live comp body for
`rules`) so a hard refresh can resume.

## Modes & Æther integration

Æther mode is unlocked at runtime via a Konami sequence
(`SecretStore`). Once unlocked, the three surfaces light up
differently:

- **Lookup** — full mode swap. `LookupView` checks `secret.aetherActive`
  and renders `AetherLookupView` (arity 3/4/5, dice −10..32, target
  1..5,000) instead of `StandardLookupView`. The standard view's
  picker bounds are tied to `STANDARD_MODE.diceRange` so the user
  cannot type a triple the dataset can't resolve.
- **Compose** — match-level rules toggle (Standard / Æther) plus an
  Æther-only candidate pool. `CompositionStore.rules` drives both the
  pool picker (`CANDIDATE_POOLS` vs `AETHER_CANDIDATE_POOLS`) and the
  resolver: standard plans key the difficulty matrix off depowered
  dice (`4 → 2`, `9 → 3`, …); Æther plans load `aether-arity3.n2k`
  via `loadDifficultyMatrixFor("aether", …)` (memoized for the
  session) and keep every face value distinct. Snapshot is `v3` with
  v1/v2 back-compat.
- **Play** — match-level toggle. The setup screen shows a
  Standard/Æther rules tile when `secret.aetherActive`, and
  `PlayStore.mode` is computed from `setup.rules` (so each race picks
  rules independently rather than flipping a global mode flag).
  Post-race, the Results screen offers a replay scrubber backed by
  `PlayStore.replayMs` / `replayTimeline` — the underlying
  `playerKnocked` / `botKnocked` arrays are immutable and the
  scrubber is a pure derived view (`currentPlayerKnocked`,
  `currentBotKnocked`).

## Dataset — `.n2k` binary format

The dataset ships as two compact binary blobs in `web/public/data/`:

- `standard.n2k` (~1 MB) — full Standard-mode dataset (all
  `DICE_COMBINATIONS` × `[1, 999]`).
- `aether-arity3.n2k` (~31 MB) — full Æther 3-arity dataset (every
  Æther 3-tuple × `[1, 5000]`); lazily loaded on the first
  Æther-mode query.

Higher-arity Æther tuples (4d / 5d) **don't have a precomputed blob** —
the bundle would be unmanageable. They fall back to
`aetherSolverWorker` on demand. The fallback chain is centralised in
`AetherDataStore.sweep`:

```
Æther 3-arity tuple → aether-arity3.n2k loader → cached
Æther 4/5-arity     → aetherSolverService worker pool
Standard            → standard.n2k loader → cached
```

`web/src/services/n2kLoader.ts` owns the parsing + lazy chunk decode;
`datasetService` is a thin facade for the standard pathway.

The bit-packed binary format itself lives in `src/core/n2kBinary.ts`
(BitReader/BitWriter + chunk encode/decode), with `src/core/n2kBlob.ts`
wrapping chunks into the file-level container. The bake pipeline
(`scripts/bake-blob.ts`) drives a `worker_threads` pool over
`exporter.worker.ts` to produce both blobs.

## Persistence — `ContentBackend`

`web/src/services/contentBackend.ts` defines the abstract document
store (`load` / `save` / `remove` / `list`). The default singleton
(`defaultContentBackend`) is `LocalStorageContentBackend`; the
interface is intentionally minimal so a future Firestore /
IndexedDB / cloud backend drops in without touching call sites.

`CompositionStore.attachAutosave()` mirrors the live snapshot to the
backend on every observable change, and `loadFromContentBackend()`
hydrates on mount. Hash-based share links take precedence — if the
URL has a `#plan=…`, that wins over the local autosave.

## Out of scope (today)

- Firestore / Firebase Auth / Gemini integration (only the `ContentBackend` seam exists).
- Real multiplayer transport (the kernel supports it; no `RemotePlayer` impl).
- Real minigames (only the kernel; the only registered game is `n2kClassic`).
- AI-generated themes (no AI service wired).
- Cloud Run backend (`packages/n2k-core` reserved for the eventual hoist).
- IndexedDB-backed `ContentBackend` (LocalStorage is enough until plans exceed ~5MB).

## Directory map (top level)

```
N2K-v3/
  src/            # Node solver workspace: core/ services/ games/ cli/
  scripts/        # bake-blob.ts, export.ts, bench-solver.ts (tsx)
  tests/          # root Vitest suites (solver, CLI, games, binary)
  web/            # Vite/React SPA — its own package.json + node_modules
    public/data/  # .n2k dataset blobs (standard, aether-arity3/4/5)
    src/          # core/ services/ stores/ features/ ui/ workers/
    tests/        # web unit tests + tests/perf/ harness
    e2e/          # Playwright responsive suite
  docs/           # this file, ROADMAP, IDEAS, changelog, plans/
  bake-logs/      # bake run logs (generated)
  tmp-bake/       # scratch bake output (generated, untracked)
  firebase.json   # hosting config (root-level; deploy from repo root)
  .firebaserc     # project ethan-488900, target almanac
```

## Exact commands

Two npm roots — the repo root and `web/` each need their own
`npm install`.

Root (solver workspace):

```bash
npm install
npm test              # Vitest — solver/CLI/games/binary suites
npm run typecheck     # tsc -p tsconfig.check.json
npm run cli           # terminal REPL (mode/dice/roll/solve/sweep/...)
npm run bake -- --mode standard        # rebuild a .n2k blob
npm run bench:solver  # solver microbenchmark
```

Web app:

```bash
cd web
npm install
npm run dev           # Vite dev server
npm test              # Vitest unit/integration (perf excluded)
npm run test:perf     # perf harness (render counts, fanout, microbench)
npm run test:e2e      # Playwright responsive sweep (needs browsers installed)
npm run build         # tsc -b && vite build → web/dist (copies .n2k blobs)
```

Deploy (from the **repo root** — `firebase.json` lives there, even
though the README says `cd web`):

```bash
cd web && npm run build && cd ..
firebase deploy --only hosting:almanac
```

`.n2k` blobs and `assets/**` are served with 1-year immutable cache
headers (see `firebase.json`), so dataset changes require new
filenames or a hard refresh to observe.

## Perf harness notes

The repo carries a deliberate performance-regression harness
(`web/tests/perf/`, run via `npm run test:perf`, ~1.3s wall):

- **Render-count baselines** per surface via a React Profiler wrapper.
- **MobX fanout assertions** — unrelated store slices must not
  re-fire each other's reactions.
- **Hot-path microbenches** — `easiestSolution`, `parseEquation`;
  budgets are 3× observed median, floored at 5ms.
- Baselines and open optimization targets: `docs/perf-baseline.md`.
- **Rule: tighten caps after wins; never loosen caps to silence a
  flaky test** — a flake means the harness is wrong, not the budget.

Solver-side perf work (branch-and-bound `easiestSolution`,
interleaved enumeration, worker prewarm) is recorded in the git
history and `docs/plan-solver-perf-and-n2k-v2.md`.

## Known limitations

- **No analytics** — zero visibility into real usage of the live site.
- **No accounts / leaderboards / profiles** — all state is per-browser
  localStorage; clearing site data loses saved competitions and stats.
- **localStorage ~5 MB quota** — large competition libraries will
  eventually need the IndexedDB backend (seam exists, impl doesn't).
- **Æther arity-5 coverage is partial** — only the first 50 canonical
  commons tuples are baked (`aether-arity5-commons.n2k`, 2 MB); the
  rest fall back to a live worker sweep (~seconds). Full bake ≈ 21 h.
- **Large blobs in git** — `aether-arity3.n2k` (~31 MB) and
  `aether-arity4-commons.n2k` (~38 MB) are tracked in git; clones are
  heavy. Under GitHub's 100 MB/file limit, but mind future bakes.
- **Deploy config untracked** — `firebase.json` / `.firebaserc` were
  untracked as of 2026-07-05 (see ROADMAP "Now").
- **No ESLint / no CI** — verification is manual (see root CLAUDE.md).
- **Google Fonts at runtime** — `web/index.html` loads ~25 font
  families from fonts.googleapis.com; these are not self-hosted. The
  PWA service worker runtime-caches them (StaleWhileRevalidate for the
  stylesheet, CacheFirst for the webfont files) so a font seen online
  keeps working offline — but a font never visited online won't be
  available offline until it is bundled/subset & self-hosted.
