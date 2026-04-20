# N2K Platform — v3

A clean-slate rebuild of the N2K codebase. Same game, same heuristics — but laid out as a platform with seams for content creation, multiplayer, minigames, and AI. Three public surfaces today: **Lookup**, **Competition**, **Play**.

## Architectural pillars

1. **Single domain.** One `NEquation` type, one solver, one difficulty heuristic. Standard mode is a `Mode` preset (arity=[3], dice 2..20, depower on); Æther is another preset (arity=[3,4,5], dice -10..32, depower off). The fast standard sweep is a *configuration* of the unified solver, not a parallel codebase.
2. **Mode-as-data.** One `LookupStore`, one `CompositionStore`, etc. The Æther toggle just flips `mode`.
3. **MobX done right.** `observable.map`, computed accessors, no `cacheTick` invalidation hacks.
4. **Themes as data.** 17 named editions in `web/src/core/themes.ts`; each picks one of 12 layout primitives.
5. **Game kernel.** `Game<TConfig, TState, TMove>` with serializable, deterministic state. Bots and (future) remote humans are interchangeable `Player` implementations.
6. **Pluggable persistence.** `ContentBackend` interface; today `LocalStorageContentBackend`, ready to swap for IndexedDB / Firestore without touching call sites.

## Layered model

```
UI (web/src/features, web/src/ui, src/cli)
  ↓
Stores (web/src/stores + per-feature stores; src/cli for the REPL)
  ↓
Services (web/src/services, src/services) — pure, stateless
  ↓
Core (src/core, web/src/core) — types, constants, binary format, theme registry
```

Strict one-way dependencies. Features never import from each other; cross-feature communication goes through stores. Stores never import UI.

## Folder layout

```
N2K-v3/
  src/                    # solver workspace (Node + shared with web via @solver/@platform)
    core/                 # zero-dep: types, constants, n2kBinary, n2kBlob
    services/             # stateless: solver, difficulty, parsing, generators,
                          # gameKernel, exporter, workerPool, competition
    games/                # n2kClassic, n2kClassicBots, knockoutBot, personas
    cli/                  # REPL (mode/dice/roll/board/solve/sweep/explain/export)
  tests/                  # vitest suite for src/
  scripts/                # bake-blob.ts (binary dataset), export.ts (JSON+binary)
  web/
    public/data/          # standard.n2k (~1MB) + aether-arity3.n2k (~31MB, lazy)
    src/
      core/               # web-only: themes registry, web types
      services/           # n2kLoader, datasetService, contentBackend,
                          # competition*, aetherSolver*, exports (PDF/DOCX),
                          # urlHashState, compressedHashCodec
      stores/             # AppStore (root), DataStore, AetherDataStore,
                          # ThemeStore, FavoritesStore, SecretStore, PlayStore,
                          # useAlmanacIndex
      ui/
        chrome/           # PageShell + 12 layouts + nav + ThemeSelector
        primitives/       # DiceGlyph, Equation, DifficultyMeter, etc.
      features/
        lookup/           # LookupStore + LookupView + AetherLookupStore/View
        compose/          # CompositionStore + ComposeView + BoardEditor
        play/             # PlayView (PlayStore lives in stores/)
      App.tsx, main.tsx, styles.css
    tests/                # vitest suite for web/
    e2e/                  # playwright tests
  docs/                   # roadmap, architecture, changelog, next-features-proposal
```

## Status

v3.1 ships three public surfaces with full Æther integration, autosave, replay scrubber, and the `.n2k` binary dataset. See `docs/changelog.md` for what's landed and `docs/next-features-proposal.md` for what's queued.

## Scripts

```bash
# solver workspace (root)
npm install
npm test            # vitest
npm run typecheck
npm run cli         # REPL
npm run bake -- --mode standard          # rebuild standard.n2k
npm run bake -- --mode aether-arity3     # rebuild aether-arity3.n2k

# web workspace
cd web
npm install
npm run dev
npm test
npm run test:e2e
npm run build
```
