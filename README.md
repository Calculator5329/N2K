# N2K Platform — v2

A clean-slate rebuild of the N2K codebase. Same game, same heuristics, same web Almanac surface — but designed from day one as a platform with seams for content creation, multiplayer, minigames, and AI.

> v1 lives at the repo root and `web/`. v2 is intentionally isolated here so the two can coexist until v2 reaches feature parity. There is no shared code path between them.

## Why a rewrite

v1 worked, and most of it was elegant, but five forms of drift accumulated:

1. **Two parallel pipelines** for Standard vs Æther (~60% duplication).
2. **MobX reactivity workarounds** (`cacheTick` ad-hoc invalidation).
3. **Themes as code**, not data — can't fit AI-generated themes.
4. **No game kernel** — Play feature is hardcoded to one game mode.
5. **No persistence/identity/AI seams** — every future feature needs a backend.

v2 fixes all five at the foundation rather than retrofitting them.

## Architectural pillars

1. **Single domain.** One `NEquation` type, one solver, one difficulty heuristic. Standard mode is just a `Mode` preset (arity=[3], dice 2..20, depower on); Æther is another preset (arity=[3,4,5], dice -10..32, depower off). The fast 6-second standard export is preserved as a *configuration* of the unified solver, not a separate codebase.
2. **Mode-as-data.** One `LookupStore`, one `LookupView`, etc. The Æther toggle just flips `mode`.
3. **MobX done right.** No `cacheTick`. `observable.map` and a `Resource<T>` helper everywhere.
4. **Themes as data.** Each edition is a `*.theme.json` document. Bundled themes and AI-generated themes share the same loader.
5. **Game kernel.** A `Game<TConfig, TState, TMove>` interface with serializable, deterministic state. Bots and remote humans are interchangeable `Player` implementations. Minigames register via the same interface.
6. **Pluggable backends.** Three abstractions — `ContentBackend`, `IdentityService`, `AIService` — backed by IndexedDB / localStorage / a stub today, ready to swap to Firestore / Firebase Auth / Gemini-via-Cloud-Run tomorrow.

## Layered model

```
UI (web/src/features, web/src/ui)
  ↓
Stores (src/cli for the REPL, web/src/stores for the app)
  ↓
Services (src/services, web/src/services) — pure, stateless
  ↓
Core (src/core) — types, constants, binary format
```

Strict one-way dependencies. Features never import from each other; cross-feature communication goes through stores. Stores never import UI.

## Folder layout

```
v2/
  src/                    # solver workspace (Node + shared with web)
    core/                 # zero-dep types, constants, binary format
    services/             # stateless: solver, difficulty, parsing, generators, gameKernel
    cli/                  # REPL (later)
  tests/                  # vitest suite
  web/                    # React + MobX + Tailwind frontend (later)
    src/
      core/               # web-only types
      services/           # ContentBackend / IdentityService / AIService + dataset client + worker
      stores/             # AppStore, DataStore, ContentStore, IdentityStore, etc.
      themes/             # registry + editions/*.theme.json
      ui/                 # layout primitives, shared components
      features/           # lookup/, compose/, play/, etc.
      app/                # App.tsx, main.tsx
    public/
    tests/
  packages/               # (future) shared core lifted out for the eventual Cloud Run backend
  scripts/                # data pipeline glue
  docs/                   # architecture, future-platforms, changelog
```

## Status

Bootstrap. See `docs/changelog.md` for what's landed.

## Scripts

```bash
npm install
npm test            # vitest suite
npm run typecheck   # tsc --noEmit
npm run build       # tsc to dist/
```
