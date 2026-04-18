# PLAN-A — Phase 1: Bulk Export Pipeline

**Branch:** `agent/phase-1-export`
**Estimated scope:** ~600–900 LoC + tests
**Depends on:** Phase 0 foundation (already on `main`)
**Blocks:** Phase 3 web app's dataset client (the web app needs `.json` chunks to consume)

## Goal

Build a single mode-aware bulk-export pipeline that, given `--mode standard|aether`, walks every legal dice tuple, runs `solveForExport` per tuple, and writes:

1. A bit-packed `.n2k` binary file containing every `(tuple, target → BulkSolution)` cell — efficient long-term storage and the canonical wire format.
2. A set of JSON chunk files (one per dice tuple, or one per arity-bucket) the web app can lazy-load on demand.
3. A `manifest.json` index describing what's in each chunk + the total target coverage.

This replaces v1's `scripts/export-dataset.ts` + `scripts/export-advanced.ts` (two separate pipelines for standard/Æther) with one unified driver.

## File boundary

### WILL create

- `src/core/n2kBinary.ts` — `BitReader`, `BitWriter`, encode/decode of `NEquation` chunks. Port from `<v1-root>/src/core/n2kBinary.ts` but generalize for variable arity (3..5) by encoding `arity` in the chunk header. Keep the same field-packing strategy v1 uses.
- `src/services/exporter.ts` — pure (sync) per-tuple export logic. Takes a `Mode` and a tuple, returns the in-memory chunk + JSON projection.
- `src/services/workerPool.ts` — Node `worker_threads` pool. Generic `Pool<TInput, TOutput>` API with a queue, configurable concurrency (default = `os.cpus().length - 1`), and a single message contract.
- `src/services/exporter.worker.ts` — the worker entry point. Receives `(mode preset id, tuple, options)`, runs `solveForExport`, posts back the result.
- `scripts/export.ts` — CLI driver. Args: `--mode standard|aether`, `--out <dir>` (defaults `./data-out/<mode>`), `--arity <3|4|5|all>` (Æther only; standard always 3), `--concurrency <n>`, `--no-binary` (JSON only), `--no-json` (binary only). Prints a progress bar.
- `tests/n2kBinary.test.ts` — round-trip tests for every arity and a wide range of equation shapes.
- `tests/exporter.test.ts` — exporter integration tests (one tuple end-to-end, manifest shape, binary ↔ JSON parity).
- `tests/workerPool.test.ts` — pool concurrency / queueing / error propagation.

### MAY modify

- `package.json` — add a single dev dep if needed (`tinybench` for perf benchmarking is OK; nothing else without coordinating). Add the script entry `"export": "tsx scripts/export.ts"`.
- `tsconfig.json` — add `"scripts/**/*.ts"` to `include` so the script type-checks. Add `"src/**/*.worker.ts"` exclusion if needed for build.
- `docs/changelog.md` — append a Phase 1 section describing what landed.
- `docs/roadmap.md` — check off Phase 1 boxes.

### MUST NOT touch

- Anything under `src/core/types.ts` or `src/core/constants.ts` (foundation is stable).
- Any existing file under `src/services/` (they're done).
- `web/` — not in scope. The web app's dataset client is Phase 3.

## Concrete API contracts

### `src/core/n2kBinary.ts`

```ts
export interface BinaryChunkHeader {
  readonly modeId: "standard" | "aether";
  readonly arity: 3 | 4 | 5;
  readonly diceTuple: readonly number[];        // length === arity
  readonly targetMin: number;
  readonly targetMax: number;
  readonly count: number;                       // number of equations packed
}

export interface BinaryChunk {
  readonly header: BinaryChunkHeader;
  readonly equations: readonly { equation: NEquation; difficulty: number }[];
}

export function encodeChunk(chunk: BinaryChunk): Uint8Array;
export function decodeChunk(bytes: Uint8Array): BinaryChunk;
```

Bit-packing scheme (port from v1, generalized):

- Header: fixed-width fields (modeId 1 bit, arity 3 bits, dice values as varints, targetMin/Max as varints, count as varint).
- Per equation: `arity * (exponent_bits)` for exponents (use `mode.exponentCap(d)` to size each field), `(arity - 1) * 2` bits for operators, varint delta-encoded total against the previous equation's total, fixed-point difficulty (multiply by 100, varint).

### `src/services/exporter.ts`

```ts
export interface ExportTupleResult {
  readonly tuple: readonly number[];
  readonly arity: 3 | 4 | 5;
  readonly equations: readonly BulkSolution[];   // sorted by target ascending
  readonly elapsedMs: number;
}

export function exportOneTuple(
  tuple: readonly number[],
  mode: Mode,
): ExportTupleResult;
```

### `scripts/export.ts` output layout

```
data-out/
  standard/
    manifest.json                         # { mode, tupleCount, totalEquations, chunks: [...] }
    chunks/
      tuple-2-3-5.json                    # JSON projection of one tuple
      tuple-2-3-6.json
      ...
    standard.n2k                          # one binary blob carrying every chunk
  aether/
    manifest.json
    chunks/
      arity-3/
        tuple--3-5-7.json
        ...
      arity-4/...
      arity-5/...
    aether.n2k
```

## Acceptance criteria

- `npm run typecheck` clean.
- `npm test` clean — at least 25 new tests added.
- `npm run export -- --mode standard --out ./data-out/standard` completes in under 60 seconds on a modern laptop and produces all expected files.
- `npm run export -- --mode aether --arity 3` completes (full Æther sweep can be slow; arity-3 is the smoke test).
- Binary round-trip: `decodeChunk(encodeChunk(c)) deepEqual c` for ≥ 100 randomly generated chunks across both modes.
- The manifest enumerates every chunk file and totals match the sum of per-chunk equation counts.

## Stretch goals (only if main goals are done)

- Resume support: if `manifest.json` exists, skip tuples already exported.
- A `--validate` flag that re-runs the solver on every exported chunk and confirms the binary round-trips.
- Per-arity progress bars in the Æther sweep.

## Hand-off / merge

Open the PR with title `Phase 1: bulk export pipeline` referencing this plan file. Include in the PR body:
- Link to a sample `manifest.json` from a real export
- Wall-clock time for `--mode standard` and `--mode aether --arity 3`
- A note if any deviation from this plan was necessary
