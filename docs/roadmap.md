# N2K Platform — Roadmap

The platform now ships **four public surfaces** — Lookup, Competition,
Library, and Play — with full Æther integration. Everything earlier
than v3.1 landed during the rebuild and is captured below for
archeology. v3.2 added the Library + Match play story end-to-end.
Everything later than v3.2 is queued.

---

## v3.2 — Library + Match play (shipped)

- **Library tab** (`features/library/`) — 4th surface, lists every saved
  competition with thumbnails, mode badges, last-played + best-avg
  stats, and a play picker (vs-bot / hot-seat + persona).
- **Match play** (`features/match/`) — `MatchStore` orchestrates a
  multi-bout race chain across phases, with pause/resume,
  bout-summary cards, phase interstitials, hot-seat pass-the-device
  overlay, and a match-end screen. Reload-survives via `match:current`
  snapshot v2.
- **Phase model** — `SharedPlanV5` reframes competitions as
  `Competition > Phase > Board > Bout`. v1..v4 plans migrate
  transparently as a single "Phase 1" wrapper.
- **Stats** — per-comp `MatchRecord` history under `stats:{compId}`,
  surfaced via roll-ups (best avg score, win rate, last played) on
  Library cards and a per-comp history drawer.
- **PlayStore extensions** — pause/resume + `RaceOverrides` for
  injecting per-bout boards / dice + `onFinished` callback +
  `silentFinish` flag for chained bouts.

---

## Where things stand (v3.1)

### Public web surfaces

- **Lookup** (`features/lookup/`) — pick three dice + a target, get the
  easiest equation. Standard view drives off the bundled
  `standard.n2k`. The Æther overlay (Konami unlock) widens the picker
  to arity 3/4/5, dice -10..32, target 1..5,000 and dispatches each
  tuple to the `aetherSolverWorker` pool.
- **Competition** (`features/compose/`, internal slug `compose`) —
  multi-board editor (manual / random / pattern with per-cell pinning),
  balanced multi-round roll generator, PDF export. Full Æther mode at
  the match-level — `aether-3d` / `aether-4d` / `aether-5d` candidate
  pools cover the full -10..32 dice range. Autosaves through
  `LocalStorageContentBackend`; URL-hash share links take precedence
  over local autosave on load.
- **Play** (`features/play/`) — 60-second knockout race vs. a bot.
  Setup screen picks the persona (Easy / Standard / Hard / Æther), the
  board source, the rules (Standard / Æther). Post-race results screen
  ships a replay scrubber backed by `replayMs` / `replayTimeline`.

### Solver workspace

- **Unified solver** (`src/services/solver.ts`) — `sweepOneTuple` /
  `easiestSolution` / `allSolutions` / `solveForExport`. One brute-force
  enumeration handles every arity 3..5 and every dice value via the
  `Mode` parameter.
- **Game kernel** (`src/services/gameKernel.ts`) — `Game<>` + `Player` +
  `replay()`. `n2kClassic` is the only registered game today; bots and
  knockout scheduling live in `src/games/`.
- **CLI REPL** (`src/cli/`) — `mode` / `dice` / `roll` / `board` /
  `solve` / `solve-all` / `sweep` / `explain` / `export` / `help`.
  No Konami; Æther is just `--mode aether`.

### Data pipeline

- **Bake** (`scripts/bake-blob.ts`) — sweeps every legal tuple for a
  mode, writes a bit-packed `.n2k` blob.
- **Export** (`scripts/export.ts`) — same sweep, JSON-chunk projection
  for tooling.
- **Runtime blobs** in `web/public/data/`:
  `standard.n2k` (~1 MB, eager) + `aether-arity3.n2k` (~31 MB, lazy
  on first Æther use).

### Cross-cutting infrastructure

- **`AppStore`** root + `useAppStore()` hook (single context, single
  composition point).
- **`ContentBackend`** abstract interface; `LocalStorageContentBackend`
  is the only impl today.
- **Themes-as-data** — 17 named editions in `web/src/core/themes.ts`,
  each binds to one of 12 layout primitives in
  `ui/chrome/layouts/`.
- **Worker pools** for both bake (`worker_threads`) and runtime Æther
  sweeps (Web Worker pool sized to `hardwareConcurrency - 1`).

### Test surface

- 259 solver tests across 20 files (root workspace).
- 44 web tests across 7 files (web workspace).
- Playwright responsive sweep covers Lookup / Competition / Play setup /
  Play race at 10 viewports (320px → 2560px).

---

## Queued stream — Æther mixed-arity Compose (v3.3)

User explicitly called this out as an oversight in v3.1: Compose
should be able to generate Æther rounds with mixed dice arity
(3 / 3+4 / 3+4+5), with the matrices **pre-baked** rather than
solved live in a worker. Full plan in
`docs/plan-aether-arity-mixes.md`. Three phases:

1. **Variable-arity plumbing** — refactor Compose's data path off
   `DiceTriple` onto `DiceMultiset`. Pure refactor PR.
2. **Bake arity-4 / arity-5 curated matrices** — arity-4 commons
   blob ✅ baked and wired 2026-04-20 as
   `aether-arity4-commons.n2k` (38 MB, 1,651 tuples); served
   instantly via `AetherDataStore.loadFromBlob`. Arity-5 commons
   partial ✅ 2026-04-20 — first 50 canonical tuples
   (`2,2,3,3,4`..`2,2,3,8,8`, 2 MB) baked under the new B&B
   easiestSolution and wired at the production URL. Single tuple
   now ~290s (was >5 min pre-B&B). Full 5,005-tuple bake projects
   to ~21 hr at concurrency 19 — queue as an overnight job when
   broader coverage is wanted.
3. **Mixed-arity rules tiles** — three Æther arity-mix presets in the
   rules row, per-round arity dispatch, per-round resolver routing.

Decision checkpoints (in the plan doc) are open and need user sign-off
on the arity-4/5 subset definitions and the total ~50 MB Æther
download budget before Phase B starts.

## Active stream — Competition Library + Match play (v3.2)

See `docs/current_task.md` for the full plan. Summary:

- **Library tab** (4th public surface) browsing locally-saved
  competitions stored via the existing `LocalStorageContentBackend`.
- **`MatchStore`** orchestrating the race chain — each saved
  competition's `(board, p1Dice, p2Dice)` tuples become a sequence of
  60-second knockout races with cumulative scoring.
- Two playable formats per competition: **vs bot** (you P1, bot P2)
  and **hot-seat** (you race both seats round-by-round).
- No backend, no DB, no kernel-level changes — orchestration sits
  above `PlayStore`.

Phased delivery: Library + persistence → vs-bot match → hot-seat → polish.

## Open follow-ups (queued)

### Polish

- [ ] **Folio numerals** — v1-era nav files used different folio orderings
      than the v3 nav (`II` vs `VI` for Competition). One source of
      truth.
- [ ] **Æther 4d/5d candidate scoring** — runs serially per candidate.
      For pools with hundreds of tuples this is slow (each candidate is
      a 1-3s worker sweep). Largely obsoleted once
      `docs/plan-aether-arity-mixes.md` lands — pre-baked matrices
      replace the live worker for Compose. Keep this entry for
      `Lookup` which still solves arbitrary user-typed tuples on
      demand.
- [ ] **Mode-aware DicePicker validation** — the typed entry validates
      against the standard range even in Æther mode (the steppers are
      mode-aware).
- [ ] **Lookup print sheet** — cosmetic styles for printable lookup
      results were retired during v3.1; revisit if printable lookup
      becomes a real ask.

### Persistence

- [x] **Saved boards** survive reload via `LocalStorageContentBackend`
      (Compose autosave wired).
- [ ] **Saved competitions** as named `CompetitionDoc` content entities
      (Library tab; v3.2 active stream).
- [ ] **Saved custom themes** as a `ThemeDoc` content entity.
- [ ] **IndexedDB backend** for boards / competitions that exceed
      localStorage's ~5 MB quota.

### Game kernel UX

- [ ] **In-app replay UI** — read a serialized game log and scrub
      move-by-move (the kernel already supports it; `Play` only shows
      the post-race scrubber).

### Backend swap (when ready)

- [ ] **`FirestoreContentBackend`** behind the existing interface.
- [ ] **`FirebaseIdentityService`** behind a future identity interface.
- [ ] **Cloud Run TS backend** hosting an AI service so API keys never
      ship to the client.
- [ ] **Hoist `src/core` + `src/services`** into `packages/n2k-core` if
      the workspace ever splits.

### Multiplayer

- [ ] **`RemotePlayer`** impl reading moves from a Firestore
      subscription (the kernel is ready).
- [ ] **Game session as a content entity.**
- [ ] **Lobby / matchmaking UI.**
- [ ] **Spectator mode** — free with the kernel design once
      `RemotePlayer` lands.

### Future ideas (no commitment, captured here so they don't leak)

- Daily challenge with global leaderboard.
- Tournaments / brackets / seasons.
- Custom dice / operators / rule modules.
- Puzzle / campaign mode.
- AI commentary, hint system, NL solve.
- Classroom mode for teachers.
- N2K minigames (each implements `Game<>`).
- PWA / offline / mobile native.

---

## Archive — phases 0 → 6.6 (rebuild work)

These all landed during the v3 rebuild. Kept here so the v3 history
isn't lost; collapsed because the surfaces / files they reference
either match the current code or were trimmed in the v3.1 prune.

- **Phase 0 — Foundation.** `core/` types + constants, `solver.ts`,
  `difficulty.ts`, `parsing.ts`, `arithmetic.ts`, `generators.ts`,
  `gameKernel.ts`, vitest suite.
- **Phase 1 — Bulk export pipeline.** `exporter.ts` + `scripts/export.ts`,
  `worker_threads` pool, `.n2k` chunks + `manifest.json`, JSON-chunk
  projection.
- **Phase 2 — CLI REPL.** `src/cli/` end-to-end (`mode` / `dice` /
  `roll` / `board` / `solve` / `solve-all` / `sweep` / `explain` /
  `export` / `help`).
- **Phase 3 — Web foundation.** Vite 6 + React 18 + MobX 6 + Tailwind 4
  + Vitest 2; root `AppStore`; theme registry; first layout primitives.
- **Phase 4 — Feature parity.** Lookup, Compose (incl. Æther rules
  toggle), Play (`PlayStore` driving `n2kClassicGame` against
  `LocalBot` personas).
- **Phase 5 — Power-user surfaces.** A round of v1-era surfaces
  (Explore / Compare / Visualize / Gallery) was rebuilt on the v3
  stack, then **retired in the v3.1 prune** (see Phase 6.5).
- **Phase 6 — Platform extensions.** Persisted boards as `BoardDoc`
  content entities, `LocalStorageContentBackend` default. Replay UI +
  Firestore + AI theme generation moved to "open follow-ups".
- **Phase 6.5 — Cleanup & consolidation (v3.1 trim).** Public nav
  trimmed to `Lookup · Competition · Play`. Compose label renamed to
  Competition. Real Æther in Competition (`aether-3d/4d/5d` pools).
  Stats line follows Æther mode via `useAlmanacIndex`. Retired
  surfaces (Explore, Compare, Visualize, Gallery, Studio, Sandbox,
  Colophon, About, plus the entire `v1features/` + `v1ui/` trees) and
  the dead `src/themes/` parallel system removed.
- **Phase 6.6 — Tabletop responsive sweep.** Lookup / Competition /
  Play audited + fixed at 10 viewports (320 → 2560px). Race screen
  switched to container queries. Playwright responsive suite (40
  cases) added.
