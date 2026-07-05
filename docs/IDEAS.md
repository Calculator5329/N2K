# N2K Platform — Ranked Expansion Ideas

Added 2026-07-05 as part of the handoff suite. Ranked by
impact-per-effort for the current strategic goal ("ship as a product,
get 50 real users"). Every idea is grounded in seams that already
exist in the code — the "Leans on" line names them. Effort: S = one
session, M = a few sessions, L = a week+, XL = multi-week.

Committed near-term work lives in `docs/roadmap.md` (Now/Next/Later);
this file is the idea backlog behind it.

---

## Tier 1 — high impact, low effort (do these first)

### 1. Daily challenge (local, date-seeded)
- **Impact/effort:** High / S–M
- **Why:** The single best retention feature for a solo game site.
  Same board for everyone, streaks, a shareable emoji-grid result
  (the Wordle loop). Needs zero backend.
- **Leans on:** board generators (`src/services/generators.ts`) accept
  a seed; `ContentBackend` stores streaks; `PlayStore` runs the race.
- **First step:** derive a deterministic seed from the UTC date, add a
  "Daily" tile to Play setup.

### 2. Shareable race replays
- **Impact/effort:** High / S
- **Why:** Every finished race becomes a marketing artifact ("beat my
  run"). Distribution built into the product.
- **Leans on:** `compressedHashCodec.ts` (already encodes whole
  competition plans into URL hashes) + the existing replay scrubber
  (`PlayStore.replayMs` / `replayTimeline`).
- **First step:** serialize `(board, dice, knock timeline, score)` to
  a `#race=` hash; render read-only results view on load.

### 3. Practice / drill mode with difficulty adaptivity
- **Impact/effort:** High / M
- **Why:** Turns the site from "game" into "mental-math trainer" —
  the portfolio framing. The difficulty heuristic already scores every
  equation, so serving "slightly harder than your last correct answer"
  is a data lookup, not new math.
- **Leans on:** `difficultyOfEquation` + the precomputed difficulty
  in `standard.n2k`; `Game<>` kernel for a new `drill` game.
- **First step:** a "Drill" game that serves single cells sorted by
  difficulty band and tracks rolling accuracy.

### 4. Teacher / classroom packet mode
- **Impact/effort:** High / S–M
- **Why:** Compose already generates balanced multi-board competitions
  and exports PDF — that IS a classroom product. Teachers are the most
  plausible "50 real users" channel.
- **Leans on:** `features/compose/`, `competitionExportPdf.ts`,
  balanced roll generator, per-cell pinning.
- **First step:** a "Classroom" preset (grade-banded difficulty caps,
  answer key page in the PDF) + a landing blurb aimed at teachers.

## Tier 2 — high impact, medium effort

### 5. Spaced-repetition weak-spot drills
- **Impact/effort:** High / M
- **Why:** Track which dice/target combos a player misses or knocks
  slowly, resurface them on an SM-2-style schedule. Deepens the
  trainer story; pairs with idea 3.
- **Leans on:** race telemetry already exists per cell (knock times in
  the replay timeline); `ContentBackend` for the review queue.
- **First step:** persist per-cell outcome records from `PlayStore`;
  build a "Review" queue sorted by due date.

### 6. Global leaderboard + profiles (daily challenge first)
- **Impact/effort:** High / L
- **Why:** The community feature everyone expects; makes the daily
  challenge competitive. Requires the first real backend.
- **Leans on:** `ContentBackend` seam (Firestore impl is a designed-in
  swap), anon identity → Firebase Auth upgrade path.
- **First step:** Firestore project + security rules for a
  `dailyScores/{date}/{uid}` collection; submit-only-once rule;
  display top-N below the daily results screen.
- **Caveat:** client-submitted scores are spoofable; ship with
  plausibility checks (score ≤ theoretical max for the board) and
  accept imperfection early.

### 7. Mobile PWA (installable, offline)
- **Impact/effort:** Medium-high / M
- **Why:** Mental-math training is a phone habit. The app is already
  a static SPA with immutable-cached data blobs — most of the work is
  a manifest + service worker + self-hosting the ~25 Google Font
  families (subset them).
- **Leans on:** static architecture; responsive sweep already tested
  at 320px (Playwright suite).
- **First step:** font subsetting/self-hosting, then a Workbox
  service worker that precaches app shell + `standard.n2k` only.

### 8. Hot-seat & async challenge links
- **Impact/effort:** Medium-high / M
- **Why:** "Race the same board as me" via URL — multiplayer feel with
  zero backend. Hot-seat already exists in Match play; async links are
  the shareable version.
- **Leans on:** hash codec + `MatchStore`'s two-seat schedule model.
- **First step:** encode `(board, dice, opponent's time/score)` into a
  challenge hash; show a ghost score line during the race.

## Tier 3 — solid, but sequenced later

### 9. Real-time multiplayer races
- **Impact/effort:** High / XL
- **Why:** The kernel was explicitly designed for it (serializable
  state, pure `applyMove`, `Player` abstraction) — but it needs
  Firestore transport, lobbies, and presence. Do after 6.
- **First step:** `RemotePlayer` impl reading moves from a Firestore
  subscription; two browsers, hardcoded room id.

### 10. Puzzle / campaign mode
- **Impact/effort:** Medium / M–L
- **Why:** Hand-authored ladders ("clear this board under 40s using
  only + and ×") give structure and progression; good content
  marketing (puzzle-of-the-week posts).
- **Leans on:** `Game<>` kernel + Compose's pinning to author boards.
- **First step:** define a `PuzzleDoc` content entity + 10
  hand-authored puzzles in a JSON file.

### 11. Hint / explain system
- **Impact/effort:** Medium / S–M
- **Why:** The solver already knows every solution and its difficulty;
  surfacing "one operator revealed" hints in races or drills makes the
  trainer beginner-friendly. The CLI even has an `explain` command.
- **First step:** a hint button in Drill mode revealing the easiest
  solution's first operand.

### 12. Custom game modes UI (mode-as-data payoff)
- **Impact/effort:** Medium / M
- **Why:** `Mode` is already a data document (`dice range, target
  range, arities, depower`); a settings panel that builds a custom
  `Mode` unlocks community rule-making. Custom modes can't use
  precomputed blobs — they ride the live solver worker, which already
  handles arbitrary tuples.
- **First step:** a "Custom" rules tile in Play setup exposing dice
  range + arity toggles, routed to the worker solver path.

### 13. Tournaments / brackets / seasons
- **Impact/effort:** Medium / L
- **Why:** Natural extension of the Competition > Phase > Board > Bout
  model — a bracket is a phase graph. Needs accounts (6) first to
  matter.
- **First step:** single-elimination bracket over saved competitions,
  local hot-seat only.

### 14. Embeddable widget / iframe ("solve today's roll")
- **Impact/effort:** Medium / M
- **Why:** A tiny embeddable Lookup or daily-challenge widget for
  blogs/forums is a distribution channel; the standard dataset is
  only ~1 MB.
- **First step:** a `/embed` route rendering a minimal Lookup with
  the eager `standard.n2k` only.

### 15. AI-generated themes
- **Impact/effort:** Low-medium / M
- **Why:** Fun demo of the themes-as-data architecture and an AI
  portfolio talking point, but users won't come for it. Note the v3.1
  prune removed the JSON theme registry — themes are TS code again
  (`web/src/core/themes.ts`), so this now needs schema work plus an
  `AIService` impl and a server to hold the key.
- **First step:** only after a Cloud Run backend exists for other
  reasons; otherwise skip.

### 16. Stats dashboard / personal profile page (local)
- **Impact/effort:** Medium / S–M
- **Why:** Match history and per-comp stats already persist
  (`stats:{compId}`); a "Your stats" surface (races run, avg score,
  difficulty distribution, streaks) makes progress visible — the
  trainer's mirror. Also the natural UI to later back with accounts.
- **First step:** aggregate existing `MatchRecord` history into one
  read-only view; add lifetime counters to race finish.

---

## Explicitly not recommended

- **Native mobile apps** — PWA (7) covers it at 5% of the cost.
- **Repairing the legacy siblings' broken `.git` dirs** — archive
  them as-is (roadmap consolidation task); the code that matters was
  already ported.
- **Full arity-5 bake before users exist** — 21 hours of compute for
  a corner of a mode most visitors never unlock (Konami-gated).
