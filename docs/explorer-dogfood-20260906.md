# N2K outcome exploration — 2026-09-06

Two observed lifecycle defects were repaired. A draft phase rename and two new
phases were lost after reload: ComposeView started autosave before async hydration,
overwriting the stored draft with constructor defaults. Autosave now starts after
hydration. New saved matches also began paused in development because StrictMode
replayed MatchView's cleanup. AppStore already owns navigation pause; the redundant
component cleanup was removed. Saved-match resume and navigation pause still pass.

## Measured workflows

Four fresh-browser scenarios ran twice successfully using real App Explorer
PageHost, drive receipts and adaptive evidence capture:

- Phase rename, Escape cancellation, last-phase deletion disabled, two additions,
  reload and restored name/count.
- Invalid zero target clamped to 1, followed by a valid target 24 query.
- Hard Quick Race, click/toggle a cell, real 60-second completion, enter/exit replay,
  and return to setup. The second click intentionally toggles a claim off.
- Generate and save a fictional competition, launch a match, pause, reload through
  the resume prompt, resume play, and navigate away/back to verify auto-pause.

The final repeat has 52 recorded steps and 624 bounded transition frames. All data
was fictional, in fresh Playwright localStorage. No dataset regeneration, personal
browser profile, deployment, or external model request was used.

Evidence beneath `web/.explorer/` is retained locally:

- Original draft-loss receipt: `dogfood/2026-09-06T20-54-56.726Z/receipt.json`.
- Initial saved-match-paused receipt: `dogfood/2026-09-06T21-01-20.715Z/receipt.json`.
- Passing run: `dogfood/2026-09-06T21-04-54.851Z/receipt.json`.
- Passing repeat: `dogfood/2026-09-06T21-08-45.235Z/receipt.json`.
- Review UI: `review.html`; responsive browser check: `review-qa.json`.

Capture ends after 2.5 seconds or 12 frames. A long race uses Explorer's temporal
samples; the frame burst is not continuous race footage. This is bounded workflow
coverage, not exhaustive coverage of all games, dice, themes, or competition trees.

## Repeat

Run a fresh strict-port Vite server from `web` on 8881, then:

```
node scripts/explorer-dogfood.mjs
node scripts/explorer-review.mjs .explorer/dogfood/<run>/receipt.json
```

`APP_EXPLORER_ROOT` can select an isolated Explorer candidate for dogfooding;
`N2K_DOGFOOD_URL` can select the owned server. Only one drive writer may use a given
server. Registered Handles journeys grew from three to six; their generated tests
are independent from the direct goal runner.

## Verification

Root typecheck and 304 tests pass. Web typecheck, 85 unit tests, 11 performance
checks and all 56 browser tests pass. The Lookup render cap remains 1: its fixture
now rejects fetch deterministically during mount, preventing unrelated OS network
failure from racing the measured keypress. Legacy browser tests now complete the
first-run welcome interaction before attempting obscured navigation.

## Explorer feedback grounded in this run

- A disappearing target crop used to add a 30-second timeout after an otherwise
  successful action. The Explorer campaign fixed this with bounded absence checks;
  the first welcome step's command-to-next-step interval dropped from about 32
  seconds to about 2.4 seconds in retained receipts.
- Standard drive commands have a 15-second response boundary. Waiting for a real
  60-second race must use host-owned temporal expectations, not a longer command
  timeout. The campaign implementation was dogfooded successfully here.
- Dynamic phase IDs regenerate during hydration. Rebind by observed semantic role
  after reload; hard-coded runtime instance IDs are not persistent entity IDs.
- No-effect signals for clicking the selected phase or decrementing a minimum die
  need state-aware interpretation. They are not evidence of a broken handler.
- Registry v4 cannot prove some required identity props forwarded by wrappers.
  Its static uncertainty must remain visible beside runtime coverage; adding fake
  fallback IDs solely to improve the scanner's count would conceal the gap.

The original registry-v2 evidence was archived by the supported adoption migration.
The candidate v4 scan still measures the same 146 sites, with 118 statically
identified and 28 unresolved forwarded-prop sites. Original ratchet floors remain
preserved pending explicit migration review. Build under those old-predicate floors
refuses; the source/test improvements must not be described as deployable yet.
