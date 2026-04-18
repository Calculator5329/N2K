# PLAN-E — Difficulty parity & calibration harness

**Branch:** `agent/difficulty-parity`
**Estimated scope:** ~400–600 LoC + tests + a generated report committed to the repo
**Depends on:** Phase 0 foundation (already on `main`)
**Blocks:** Nothing — this is a confidence/quality plan
**Synergy:** If Plan A's exporter exists, this can sweep its output too.

## Goal

The Phase 0 changelog notes:

> **Known small drift:** equations with two consecutive `*` operators score slightly differently in standard mode vs v1 because the unified formula sums all multiplications instead of v1 standard's "keep last only" semantics. The drift is minor (≤ a few points) and the relative ordering is preserved.

We need to **measure that drift precisely**, characterize it across a large sample, and decide whether to:
1. Accept it (because v2's behavior is more consistent and the ordering is preserved), OR
2. Adjust the unified weights to minimize the gap, OR
3. Add a `mode.legacyMultiplyStacking?: boolean` toggle so standard mode can opt in to v1's exact semantics.

The harness:
- Generates a large, representative sample of `(mode, equation)` pairs.
- Runs v2's `difficultyOfEquation` on every one.
- Loads v1's expected outputs from a vendored fixture file (the v1 codebase still exists at the repo root — call its API offline once to produce the fixture, commit it, then this harness reads it).
- Reports per-bucket statistics + flagged outliers.

## File boundary

### WILL create

- `src/calibration/sampler.ts` — generates a deterministic, seeded sample of `(mode, dice, target)` tuples covering both modes' full input space (random + edge-case slices).
- `src/calibration/parityRunner.ts` — runs v2's solver/difficulty over every sample and pairs each result with the v1 fixture row.
- `src/calibration/report.ts` — emits both a Markdown summary (`docs/calibration/parity-report.md`) and a CSV of every diff (`docs/calibration/parity-report.csv`).
- `src/calibration/v1Fixture.ts` — typed accessor over the vendored fixture JSON. Loads it once and caches.
- `scripts/calibration/generate-v1-fixture.mjs` — **lives outside the v2 npm package** because it imports from `<repo-root>/web/src/services/difficulty.ts` (v1). Reads ~10k random samples from v1, writes them to `v2/fixtures/v1-difficulty.json`. Run manually, output committed. **Network not required.**
- `scripts/calibration/run-parity.ts` — CLI: `tsx scripts/calibration/run-parity.ts [--seed N] [--samples N] [--out docs/calibration/]`.
- `tests/calibration/sampler.test.ts` — sampler determinism, coverage assertions.
- `tests/calibration/report.test.ts` — golden-file tests: a small fixture in → a known summary out.
- `docs/calibration/parity-report.md` — **committed output** of one canonical run, so reviewers see the current drift without running the harness.
- `docs/calibration/parity-report.csv` — committed for the same reason.
- `fixtures/v1-difficulty.json` — vendored v1 sample data. Compressed JSON (one line per record), ≤ ~5 MB.

### MAY modify

- `package.json` — add `"calibrate": "tsx scripts/calibration/run-parity.ts"`. Add `"calibrate:fixture": "node scripts/calibration/generate-v1-fixture.mjs"`.
- `tsconfig.json` — include `"src/calibration/**/*.ts"` and `"scripts/calibration/**/*.ts"`.
- `docs/changelog.md` — append a "Calibration harness" section with the headline drift number.
- `docs/architecture.md` — add a one-paragraph "Calibration policy" subsection: "Drift is acceptable when (a) per-equation magnitude is < 5 points AND (b) ordinal correlation across all sampled equations is ≥ 0.99. Add a config toggle when either threshold is breached."

### MUST NOT touch

- `src/core/`, `src/services/` — read-only. The calibration finding is an **input** to a future change there, not a change itself. If the harness reveals a problem, the fix lands as a separate PR.
- `web/`, `src/games/`, the in-flight Phase 1 / N2K-Classic files — out of scope.
- v1's source files — read-only access only. The fixture generator script imports them but does not modify.

## Concrete contracts

### Sampler

```ts
export interface SamplePoint {
  readonly modeId: ModeId;
  readonly dice: readonly number[];
  readonly target: number;
  /** Stable hash for joining v1 ↔ v2 results without serializing the equation. */
  readonly key: string;
}

export interface SamplerOptions {
  readonly modes: readonly ModeId[];
  readonly samplesPerMode: number;
  readonly seed: number;
  /** Include "edge" samples: smallest/largest dice, target = boundary, etc. */
  readonly includeEdges: boolean;
}

export function generateSamples(opts: SamplerOptions): readonly SamplePoint[];
```

### Report shape

```ts
export interface ParityReport {
  readonly generatedAt: string;
  readonly v1FixtureSha: string;
  readonly samples: number;
  readonly perMode: Record<ModeId, ModeStats>;
  readonly worstOffenders: readonly DiffRow[]; // top N by |delta|
}

export interface ModeStats {
  readonly samples: number;
  readonly meanAbsDelta: number;
  readonly p50AbsDelta: number;
  readonly p95AbsDelta: number;
  readonly maxAbsDelta: number;
  readonly spearmanCorrelation: number; // ordinal preservation
  readonly exactMatchRate: number;      // |delta| < 0.5
}
```

The Markdown report has these sections in order: **Headline**, **Per-mode summary table**, **Distribution histogram (ASCII)**, **Top 20 worst offenders with their equations side-by-side**, **Recommendation** (auto-generated from the thresholds in the architecture doc).

## Acceptance criteria

- `npm run typecheck` clean.
- `npm test` clean — at least 15 new tests.
- `npm run calibrate` runs end-to-end in under 60 seconds with the default 5k-sample-per-mode setting.
- The committed `docs/calibration/parity-report.md` is generated by the harness (deterministic; same seed → same file).
- The "Headline" section states whether the architectural threshold is met.
- If the threshold is NOT met, the recommendation auto-suggests one of: (a) accept, (b) re-tune `STANDARD_DIFFICULTY` weight `wOps` by a specific delta, or (c) introduce `mode.legacyMultiplyStacking`.

## Stretch goals

- A `--bisect` mode that tries small perturbations to a target weight and reports which one minimizes drift while preserving ordering.
- Per-equation-shape buckets (e.g. "two consecutive `*`", "any negative base", "any exponent ≥ 4") so the recommendation can target a specific weight without affecting unrelated cases.
- A second harness pass that compares v2 standard ↔ v2 Æther for the same equations to surface mode-philosophy differences (informational only — no action expected).

## Hand-off / merge

Open the PR with title `Calibration: difficulty parity harness + first report` referencing this plan file. Include in the PR body:
- The headline drift number (e.g. "mean abs delta = 1.4, max 7.2, ordering preserved (Spearman 0.998)")
- The recommendation
- Confirmation that no foundation files were modified
