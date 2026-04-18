# N2K Platform — Architecture

## Layered model

```
┌──────────────────────────────────────────────────────────────┐
│                            UI                                │
│  CLI REPL (src/cli)              Web app (web/src/features)  │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                          STORES                              │
│  src/cli (REPL state)                                        │
│  web/src/stores (AppStore, DataStore, ContentStore,          │
│                  IdentityStore, GameStore, ThemeStore, …)    │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                         SERVICES                             │
│  src/services (solver, difficulty, gameKernel, parsing, …)   │
│  web/src/services (datasetClient, contentBackend,            │
│                    identityService, aiService, worker, …)    │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                           CORE                               │
│  src/core (types, constants, n2kBinary)                      │
└──────────────────────────────────────────────────────────────┘
```

Strict one-way dependencies. UI observes stores and dispatches actions; stores orchestrate services; services are pure and stateless; core has zero runtime deps.

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

## Pluggable backends

Three thin interfaces sit between the stores and any future server:

```ts
interface ContentBackend  { get/put/delete/list/subscribe }   // Local: IndexedDB; Future: Firestore
interface IdentityService { currentUser, onChange, signIn? }   // Local: anon UUID; Future: Firebase Auth
interface AIService       { complete, completeStructured, stream }  // Local: stub; Future: Gemini via Cloud Run
```

Today's implementations live entirely in the browser. Tomorrow's swap in via dependency injection at app boot — feature code never changes.

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

The game state must be serializable and `applyMove` must be pure. Replays = `(initialState, moveLog)`. Multiplayer = the same with a Firestore transport for `pickMove`. Minigames register the same way.

## Themes as data

Each theme is a `*.theme.json` document conforming to a single schema:

```ts
interface Theme {
  id: string;
  label: string;
  tagline: string;
  swatches: readonly string[];
  layoutId: LayoutId;            // one of 3-4 layout primitives
  variants: { dice: DiceGlyphVariant; equation: EquationVariant; ... };
  tokens: { colors, typography, ornaments, scale };
}
```

Bundled themes live under `web/src/themes/editions/`. Custom themes are `ThemeDoc` content entities loaded through `ContentBackend`. AI-generated themes ask Gemini for a JSON document matching the schema.

## Out of scope (today)

- Real Firestore / Firebase Auth / Gemini integration (only the seams).
- Real multiplayer transport.
- Real minigames (only the kernel).
- Custom-theme-via-NLP UI (only the loader path).
- Cloud Run backend (workspace reserved as `packages/n2k-core` to be hoisted later).
