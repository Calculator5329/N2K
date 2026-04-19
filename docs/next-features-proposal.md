# v3 Next-Features Proposal

**Based on audit completed 2026-04-19.** v3 achieves feature parity with v2 plus 3 new surfaces (Play, Studio, Sandbox). Game kernel wired into UI; critical gaps remain in persistence, multiplayer, cloud integration.

## Where v3 stands

**Shipped:** 10 surfaces, 17 themes, game kernel, board persistence, web worker, 334 tests.

**Gaps:** No CompetitionDoc persistence, custom-theme UI, game replay, IndexedDB, multiplayer, cloud backends, daily challenge, AI integration, PWA/offline.

## Batch 1 — Quick wins (S, ≤2h each)

### 1.1 CompetitionDoc persistence

**Why:** Users lose competition plans on reload. Backend abstraction exists.

**Scope:** competitionLibrary.ts, CompetitionLibraryStore.ts, add Load/Append/Delete UI panel.

**Effort:** S

**Acceptance:** Saved competitions persist. 5 new tests cover CRUD + subscription.

### 1.2 Keyboard shortcut: Share Lookup result

**Why:** Keyboard users cannot quickly copy a specific lookup result link.

**Scope:** LookupView.tsx (Ctrl+C handler), urlHashState.ts (writeLookupHash helper).

**Effort:** S

**Acceptance:** Ctrl+C → clipboard contains shareable URL. Paste → auto-navigates to same result.

### 1.3 Display board-generation seed in Compose

**Why:** Users cannot reproduce boards without seed.

**Scope:** ComposeStore.ts (track seed), ComposeSurface.tsx (display + manual entry).

**Effort:** S

**Acceptance:** Show "Seed: 0x1a2b3c". Edit to re-generate. Copy seed → new session regenerates identically.

### 1.4 Client error reporting

**Why:** No observability; production errors vanish.

**Scope:** errorReporting.ts (new), logs to localStorage under n2k.errors.v1.*.

**Effort:** S

**Acceptance:** Errors logged. "Download error log" button in About. Last 100 errors retained.

### 1.5 Theme editor color picker

**Why:** Gallery shows themes; users cannot try color variations.

**Scope:** ThemeEditor.tsx (new), ThemeStore.ts (createTempTheme), GalleryView.tsx (Edit button).

**Effort:** M (half-day)

**Acceptance:** Edit theme → color pickers with live preview. "Save as new" persists.

---

## Batch 2 — Feature work (1–3 days each, M–L)

### 2.1 Game replay UI: scrubber + move-by-move

**Why:** Game kernel stores moves; Play cannot rewind/step. Replay is free.

**Scope:** PlayReplay.tsx (new), PlayStore.ts (replayState, goToMove), PlayView.tsx (Replay tab).

**Effort:** L

**Acceptance:** Play → Replay tab → timeline slider + arrow nav. "Export replay" downloads JSON.

### 2.2 IndexedDB content backend

**Why:** localStorage caps at ~5MB; IndexedDB (50MB+) is drop-in swap.

**Scope:** idbContentBackend.ts (new), config flag in createDefaultAppStore.

**Effort:** L

**Acceptance:** 5 new tests. Manual: 50 boards persist on reload. Auto-migrate from localStorage.

### 2.3 AI theme prompt + validation

**Why:** Users lack theme authoring path. Gemini can generate from NLP prompts.

**Scope:** AIThemeGenerator.tsx (new), aiService.ts (wire completeStructured), ThemeStore.ts (createThemeFromAI).

**Effort:** L

**Acceptance:** "Create with AI" → prompt textarea. Gemini generates Theme JSON. Validator checks schema. Valid → Gallery; invalid → error + retry.

### 2.4 Custom game-mode UI (minigames registry)

**Why:** Game kernel accepts any Game<>; UI hardcodes N2K Classic.

**Scope:** minigameRegistry.ts (new), PlayModePicker.tsx (new), PlayView.tsx (gameId routing).

**Effort:** M

**Acceptance:** Play shows mode selector. Dropdown with N2K Classic + future minigames. Setup tailors to game.

### 2.5 Keyboard-only Compose board editor

**Why:** Power users cannot author large plans without mouse.

**Scope:** BoardEditor.tsx (arrow-key nav, Space/Enter, Ctrl+A), ARIA roles.

**Effort:** M

**Acceptance:** Tab-navigable cells. Arrow keys move. Space toggles pin. Ctrl+A select all.

### 2.6 Sandbox hot-seat multiplayer (2–4 players)

**Why:** Sandbox shows kernel state; cannot play full game. Local hot-seat is free.

**Scope:** SandboxStore.ts (local player support), SandboxSurface.tsx (mode picker), PlayerSelector.tsx (new).

**Effort:** M

**Acceptance:** Select "2v2" → assign seats (Human/Bot) → game proceeds with human move panels.

---

## Batch 3 — Platform investments (1–2 weeks each, XL)

### 3.1 Firebase Auth + Firestore backend swap

**Why:** localStorage/memory backends don't scale. Firebase minimal viable backend.

**Scope:** firebaseIdentityService.ts (new), firestoreContentBackend.ts (new), firebase-config.ts (new).

**Effort:** XL

**Acceptance:** Build with VITE_FIREBASE_PROJECT_ID → Firebase boots. Sign-in button. Boards from Firestore (owner-isolated). Cross-device multiplayer enabled.

### 3.2 Multiplayer lobby + RemotePlayer transport

**Why:** Game kernel supports any Player impl; network humans are missing layer.

**Scope:** MultiplayerLobby.tsx (new), multiplayer.ts (new), remotePlayer.ts (new).

**Effort:** XL

**Acceptance:** Multiplayer tab → email invite → URL. Friend joins → waits. Players RSVP → game starts. Live board sync. Spectator mode.

### 3.3 Daily challenge + seasonal leaderboard

**Why:** Retention hook. Daily puzzle + leaderboard = recurring engagement.

**Scope:** dailyChallenge.ts (new), DailyChallengeStore.ts (new), DailyChallengeView.tsx (new).

**Effort:** XL

**Acceptance:** Nav item "Daily Challenge" → fixed puzzle per date. Submit score → leaderboard (top 10, your rank, season progress). Calendar view past.

### 3.4 Tournament brackets + matchmaking

**Why:** Compose generates plans; no tournament infra. Brackets enable group tournaments.

**Scope:** tournament.ts (new), TournamentStore.ts (new), TournamentSetup.tsx + TournamentBoard.tsx (new).

**Effort:** XL

**Acceptance:** Create tournament → bracket type + players. Admins assign R1 pairings. Players play. Results auto-advance. Bracket tree visualization.

---

## Batch 4 — Speculative / Future

4.1 AI hint system - Gemini step-by-step without full solution.
4.2 Mobile native (React Native) - iOS/Android, offline replay.
4.3 Puzzle campaign - Linear progression, cosmetic rewards.
4.4 Custom rules modules - User-defined operators, exponent caps.
4.5 PWA + service-worker offline.
4.6 Analytics + telemetry.
4.7 Accessibility deep dive - High-contrast, keyboard audit.
4.8 Custom layout authoring - UI design without code.

---

## Cross-cutting infrastructure

- Visual regression tests (Percy) for Play/Sandbox/Studio
- E2E tests (Playwright) for all 10 surfaces
- Bundle size budget <150KB gzipped
- Performance metrics (FCP, LCP, TTI)
- Documentation: minigame guide, Firebase setup, multiplayer testing
- CI/CD: GitHub Actions, visual snapshot testing, staging auto-deploy

---

## Recommended order

**Phase A (4–5 weeks):** CompetitionDoc → CustomGameModes → BoardSeed → Firebase → IndexedDB → Multiplayer

**Phase B (8–10 weeks):** GameReplay → KeyboardCompose → ErrorReporting → AITheme → ThemeEditor

**Phase C (16–20 weeks):** DailyChallenge → Tournaments → HotSeat → Future

---

## Success criteria

**Phase A:** 380+ tests, Firebase wired, Play supports 2+ modes.
**Phase B:** 420+ tests, replay UI, keyboard flows, error reporting.
**Phase C:** 500+ tests, multiplayer live, daily challenge, tournaments, DAU 100+.

---

## Top 3 next items

1. **Batch 1.1 — CompetitionDoc persistence** (S, ≤2h)
   - Critical gap: users lose work. Minimal scope.

2. **Batch 2.4 — Custom game-mode UI** (M, half-day)
   - Unblocks minigames. Sets extensibility pattern.

3. **Batch 3.1 — Firebase Auth + Firestore** (XL, 1–2 weeks)
   - Foundational for multiplayer, daily challenges, tournaments.

This proposal advances v3 from polished single-player to multi-player, cloud-backed, tournament-grade platform over 16–20 weeks.
