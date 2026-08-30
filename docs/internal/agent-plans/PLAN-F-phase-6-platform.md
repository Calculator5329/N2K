# PLAN-F — Phase 6: Platform Extensions

**Branch:** `agent/phase-6-platform`
**Status:** drafted, awaiting kickoff
**Author:** integration session 2026-04-19

## Goal

Lift the v2 platform off "all features run from one process with no
persistence" and onto the contracts that real users (and the eventual
backend) will ride. After Phase 6, custom user content (boards,
competitions, themes), game replay, and AI-generated themes all work
end-to-end **without** changing the bootstrap interfaces — the only
swap left for Phase 7 is the impl of three services we already own.

## Non-goals

- Cloud Run / Firestore / Firebase Auth / Gemini are **not** wired in
  here. They land in Phase 7 by swapping `MemoryContentBackend` →
  `FirestoreContentBackend`, `AnonIdentityService` →
  `FirebaseIdentityService`, `StubAIService` →
  `GeminiAIService`. Phase 6 freezes the contracts so that swap is
  one-line each.
- Multiplayer / lobby / matchmaking is Phase 8.

## Sub-tasks (each is a separable PR)

### F1 — IndexedDB ContentBackend (`web/src/services/local/idbContentBackend.ts`)

Drop-in replacement for `MemoryContentBackend`. Same interface,
persists across reloads. `createDefaultAppStore` switches to it when
`window.indexedDB` is present, falls back to memory otherwise (Node
test env).

- Schema: one IDB database `n2k-content`, one object store per
  `kind` keyed by `id`. Indexes on `updatedAt` for `list({ orderBy:
  "updatedAt" })`.
- Subscriptions: in-memory `EventTarget` per kind, fired on
  `put`/`delete`. (No multi-tab fan-out yet — that's a Firestore
  feature.)
- Tests: copy `memoryContentBackend.test.ts` and bootstrap with
  `fake-indexeddb`. Same eight cases pass.

### F2 — `BoardDoc` + Compose persistence

- `web/src/core/contentTypes.ts`: `BoardDoc { mode, name, board,
  createdBy, createdAt }`. Lives next to existing `core/types.ts`.
- `ComposeStore` gains `saveBoard(name)` / `loadBoard(id)` /
  `deleteBoard(id)` against the active `ContentBackend`.
- `ComposeView` gets a "Saved boards" panel listing the current
  user's boards (`backend.list({ kind: "board", filter: { createdBy:
  identity.userId } })`) with restore + delete.
- Tests: `ComposeStore.test.ts` (round-trip a board through
  `MemoryContentBackend`, verify list filtering by user).

### F3 — `CompetitionDoc` + Compose results persistence

- `CompetitionDoc { mode, plan: GeneratedPlan, params, createdBy,
  createdAt }`.
- `ComposeStore.savePlan()` writes the latest result; `loadPlan(id)`
  restores it (no regeneration).
- View gets a "Saved competitions" tab. Existing JSON / CSV export
  buttons unchanged.
- Tests: 3 cases (round-trip, list, delete).

### F4 — `ThemeDoc` + ThemeStore hydration

- `ThemeDoc` is the existing `Theme` shape (id, displayName, tokens)
  plus `createdBy` + `createdAt`. Built-in `tabletop` / `noir` /
  `arcade` / `papyrus` / `pixel-arcade` are seeded into the backend
  on first launch via a `seedBuiltInThemes(backend)` helper.
- `ThemeStore` reads its registry from
  `backend.subscribeKind("theme")`. Existing static `BUILT_IN_THEMES`
  becomes the seed corpus only.
- User can `registerTheme(theme)` from the UI; persisted.
- Tests: hydration + override (a user theme with the same id as a
  built-in wins after seed has run once).

### F5 — Game replay UI (`web/src/features/play/ReplayView.tsx`)

The kernel already supports `replay()`. This surface reads a
serialized game session from `ContentBackend` and lets the user scrub
move-by-move.

- `GameSessionDoc { gameId, modeId, config, players, log:
  ReadonlyArray<{ player, move }>, createdAt }`.
- `PlayStore` already records every move during a match. On `end()`
  it writes a `GameSessionDoc`.
- `ReplayView` renders a timeline (slider + ◀ ▶ ▶▶ buttons) and
  drives `n2kClassicGame.applyMove` through the recorded moves to
  reconstruct each intermediate state.
- Tests: round-trip a recorded session (use the existing fixture from
  `n2kClassicReplay.test.ts`).

### F6 — AI-generated themes (Stub-backed)

Wire the `AIService` end-to-end so the only Phase 7 change is the
service impl.

- `web/src/features/gallery/AIThemePrompt.tsx` — text input + "Generate"
  button. Calls `aiService.completeStructured<Theme>` with a JSON-Schema
  matching `ThemeTokens`. `StubAIService` returns a deterministic
  rotated palette so the UX is testable today.
- Generated theme is registered via `themeStore.registerTheme()` and
  persisted via `ContentBackend` (so it survives a reload).
- Tests: prompt → schema-validated tokens → registered + persisted (3
  cases against `StubAIService` + `MemoryContentBackend`).

## Acceptance criteria

- All existing tests still pass (`npm test` root + web).
- `npm test` adds **at least 20 new test cases** across F1–F6.
- Manual smoke: in dev mode, save a board → reload → board still
  there. Generate a theme via the AI prompt → theme appears in
  Gallery and persists across reload. Play a match → "Watch replay"
  link reconstructs every move.
- No file in `src/core/` or `src/services/` (root, not `web/`) is
  modified — Phase 6 is a pure web-layer expansion on top of the
  Phase 0–5 platform.

## Deferred to Phase 7

- Real backend (Cloud Run + Firestore + Firebase Auth + Gemini).
- Multi-tab subscription fan-out.
- `Resource<T>`-driven async forms (Phase 6 uses inline `await` for
  saves; revisit when latency matters).

## Suggested execution order

F1 → F4 → F2 → F3 → F5 → F6. F1 is a precondition for everything
else; F4 + F6 are the most user-visible; F2 + F3 round out the
"persisted content" promise; F5 is the reward.
