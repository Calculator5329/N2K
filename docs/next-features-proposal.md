# N2K v3.1 — Next-Features Proposal

**Snapshot taken:** 2026-04-19, post v3.1 trim + dead-code prune.

The platform now ships **three public surfaces** — Lookup, Competition,
Play — with full Æther integration, autosave, the replay scrubber, and
the `.n2k` binary dataset. Test surface: 259 solver tests + 44 web
tests + 40 Playwright responsive cases.

This doc is the queue: what would land next, why it's worth it,
roughly how big it is. It is **not** a commitment.

---

## Done since the last proposal (kept here so the history is local)

- **Æther rules toggle in Compose** — `loadDifficultyMatrixFor(mode)`
  + `makeMatrixResolver(matrix, mode)` + `CompositionStore.rules`.
  Generating a "Compose under Æther rules" plan now resolves against
  `aether-arity3.n2k` instead of silently falling back to the standard
  matrix.
- **Round-spice slider on the stratifier** —
  `BalancedRollsOptions.spice` (0..1) with three presets (gentle /
  balanced / spicy) on `CompositionStore`.
- **Game replay UI on Play** — `PlayStore` gained `replayMs` /
  `replayPlaying` + replay-aware accessors, plus the
  `enterReplay` / `togglePlayReplay` / `stepReplay` / `setReplayMs` /
  `exitReplay` actions. Results screen ships a "▶ Replay race" button
  that expands to a scrubber with player/bot tick rails, ←/→ event
  stepping, Space play/pause, Esc exit. (Export-replay JSON button
  not yet wired — opportunistic follow-up.)
- **Tabletop responsive sweep** — Lookup / Competition / Play audited
  + fixed at 10 viewports (320 → 2560px). Race screen uses container
  queries; rounds table scrolls inline below 420px.
- **v3.1 dead-code prune (round 1 + 2)** — empty feature dirs, parallel
  themes-as-data subtree, virtualization helper, stale audit docs,
  and 11 dead exports across `src/` + `web/src/` removed. Headers
  updated to match the 3-tab reality.

---

## Quick wins (S, ≤2h each)

### CompetitionDoc persistence

**Why.** Competition plans only survive autosave for the *current*
plan. There's no "save this card and come back to it" library yet.
The interface is ready (`ContentBackend`); only the doc shape +
library store are missing.

**Scope.** `competitionLibrary.ts`, `CompetitionLibraryStore.ts`,
Load / Append / Delete UI panel on Competition.

### Keyboard shortcut: share Lookup result

**Why.** Lookup already has URL-hash state for the Compose plan
codec; we just don't have a one-key copy for a Lookup permalink.

**Scope.** `LookupView.tsx` (Ctrl+C handler), `urlHashState.ts`
(`writeLookupHash` helper).

### Client error reporting

**Why.** No observability today; production exceptions vanish.

**Scope.** `errorReporting.ts` (new), logs to localStorage under
`n2k.errors.v1.*`. "Download error log" affordance somewhere
reachable (footer or theme selector overflow).

---

## Feature work (M–L, 1–3 days each)

### IndexedDB-backed `ContentBackend`

**Why.** localStorage caps at ~5 MB. A user with a few dozen saved
boards + competitions will hit it.

**Scope.** `idbContentBackend.ts` (new), config flag in the
`AppStore` constructor. Auto-migrate from `LocalStorageContentBackend`
on first use. 5 new tests covering CRUD + the migration.

### Export-replay JSON button on Play

**Why.** The replay scrubber works but you can't *save* a race for
later or share it. Kernel state is already serializable.

**Scope.** `PlayView` results screen gets an "Export replay" button;
`gameKernel.serialize` already produces what we need.

### Custom game-mode picker (minigames registry)

**Why.** The `Game<>` kernel was built explicitly so other games
could plug in. `n2kClassic` is the only one wired.

**Scope.** `minigameRegistry.ts` (new), `PlayModePicker.tsx` (new),
`PlayView.tsx` routes by `gameId`. Setup screens tailor to game.

### Keyboard-only Compose board editor

**Why.** Power users authoring large plans need keyboard nav.

**Scope.** `BoardEditor.tsx` — arrow-key nav between cells, Space
toggles pin, Enter opens cell editor, Ctrl+A select-all. ARIA roles.

### Folio-numeral source of truth

**Why.** A v1-era nav file used different folio orderings than the
v3 nav (Competition was both `II` and `VI` in different code paths).

**Scope.** Pick one nav module as canonical, delete the other.

### Æther 4d/5d candidate scoring — parallelize

**Why.** Æther 4d/5d Compose pools score serially per candidate;
each candidate is a 1–3s worker sweep. Hundreds of candidates → tens
of seconds.

**Scope.** Up-front "warm the chunk cache for this pool" pass +
parallel scoring across the existing worker pool.

### Mode-aware DicePicker validation

**Why.** Lookup's typed entry validates against the standard dice
range even when Æther is active (the steppers handle it correctly).

**Scope.** `DicePicker` reads the active mode from `secret` instead
of hard-coding standard bounds.

---

## Platform investments (XL, 1–2 weeks each)

### Firebase Auth + `FirestoreContentBackend`

**Why.** Local-only persistence doesn't scale to multi-device or
multiplayer. The `ContentBackend` interface was designed exactly so
this drop-in is one wiring change.

**Scope.** `firebaseIdentityService.ts` (new), `firestoreContentBackend.ts`
(new), build-time `VITE_FIREBASE_PROJECT_ID` flag. Sign-in button.
Boards / competitions key off the auth UID and become owner-isolated.

### `RemotePlayer` multiplayer transport + lobby

**Why.** Kernel supports any `Player` impl; networked humans are the
missing layer. Replay / spectator mode comes essentially free.

**Scope.** `RemotePlayer` reads moves from a Firestore subscription.
Game session is a content entity. Lobby / matchmaking UI.

### Daily challenge + leaderboard

**Why.** Retention. Daily puzzle + leaderboard = recurring
engagement once auth + cloud are wired.

**Scope.** `dailyChallenge.ts`, `DailyChallengeStore.ts`,
`DailyChallengeView.tsx` (new public surface). Calendar view of
past challenges. Top-10 + your-rank UI.

---

## Speculative / future

- AI hint system (Gemini step-by-step without full solution).
- AI-generated themes (`aiService.ts` placeholder + Theme JSON
  validator + Gemini call).
- Mobile native (React Native) — iOS/Android, offline replay.
- Puzzle campaign — linear progression, cosmetic rewards.
- Custom rule modules — user-defined operators, exponent caps.
- PWA + service-worker offline.
- Analytics / telemetry.
- Accessibility deep-dive — high-contrast pass, full keyboard audit.
- Custom layout authoring — design a layout primitive in-app.
- N2K minigames (each implements `Game<>` + registers).

---

## Cross-cutting infrastructure (run alongside the above)

- Visual regression tests (Percy or Playwright snapshots) for the
  three public surfaces.
- Bundle-size budget (target: <150 KB gzipped excluding the lazy
  `aether-arity3.n2k` blob).
- Performance metrics (FCP, LCP, TTI).
- CI/CD on GitHub Actions, staging auto-deploy.

---

## Suggested order

1. **CompetitionDoc persistence** + **error reporting** + **export
   replay** — quick polish wins, no architectural risk.
2. **IndexedDB backend** + **Firebase swap** — flips the
   `ContentBackend` impl; everything else benefits.
3. **`RemotePlayer` + lobby** — only after the cloud backend is
   live; unlocks the daily challenge + tournaments.
4. **Daily challenge** + **minigame registry** — retention &
   extensibility on top of the above.
