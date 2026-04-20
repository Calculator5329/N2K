# N2K Platform — Architecture

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
