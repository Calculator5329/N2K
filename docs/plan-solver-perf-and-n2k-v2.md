# Plan — Solver perf overhaul + Æther curated blobs + `.n2k` v2 format

**Status:** approved, ready to execute (Phase 1 starting)
**Scope:** solver, dice legality, on-disk format, Lookup UI for arity 4/5
**Author:** April 2026 session
**Triggering observation:** Æther arity-5 `easiestSolution` for a single
target enumerates ~120 perms × thousands of exp-tuples × 256 op-tuples,
producing all solutions before returning the easiest one. The user's
question — "do we really need all permutations?" — is the right one.
For the single-target case: no.

---

## Goals

1. **Æther lookup feels instant** for the 80% case (common dice rolls).
   Target: <100ms perceived latency for any arity-4/5 single-target
   query on common dice.
2. **`.n2k` blobs ship for arity 4 + arity 5** (curated samples).
   Target: each blob ≤ 60 MB compressed. Lazy-loaded only on first
   Æther use, code-split.
3. **Solver itself becomes faster for everyone**, including uncovered
   dice that fall through to the worker. Target: 10–100× speedup on
   `easiestSolution` for the common arity-4/5 case.
4. **`.n2k` v2 format** — tighter than v1, with arity-4/5 first-class.
5. **Honest legality rules for arity 4/5** — codify what a "legal"
   higher-arity Æther roll is so the curator and the picker agree.

## Non-goals

- Server-side solver (everything stays client-side).
- Full coverage of every Æther tuple (1M+ for arity 5 — not feasible
  as a static blob).
- Changing standard mode's user-visible behavior except for the
  necessary regen.

---

## A. Æther dice legality — formalized

Today only `isLegalDiceTriple(triple)` exists, baked into standard
mode's roll generators and `DICE_COMBINATIONS`. Æther arity 4/5 has no
legality predicate at all. The Lookup picker, candidate pool, and
curator all need one.

### Proposed rule (per user steer, 2026-04-19)

> **For an N-arity dice roll: at most one `1`, and at most `N − 1` of
> the same value.**

Worked examples:

| Roll                   | N | legal? | reason                                |
|------------------------|---|--------|---------------------------------------|
| `[5, 5, 5]`            | 3 | no     | 3 of the same (≥ N)                   |
| `[5, 5, 7]`            | 3 | yes    | 2 of the same (< N)                   |
| `[1, 1, 7]`            | 3 | no     | 2 ones                                |
| `[5, 5, 5, 7]`         | 4 | yes    | 3 of the same (< N)                   |
| `[5, 5, 5, 5]`         | 4 | no     | 4 of the same (≥ N)                   |
| `[1, 5, 5, 5]`         | 4 | yes    | 1 one + 3-of-a-kind (each ≤ N−1)      |
| `[1, 1, 5, 7]`         | 4 | no     | 2 ones                                |
| `[5, 5, 5, 5, 7]`      | 5 | yes    | 4 of the same (< N)                   |
| `[5, 5, 5, 5, 5]`      | 5 | no     | 5 of the same                         |
| `[1, 13, 13, 13, 17]`  | 5 | yes    | 1 one + 3-of-a-kind 13s (≤ 4)         |
| `[1, 13, 15, 19, 19]`  | 5 | yes    | 1 one + 2-of-a-kind                   |
| `[0, 5, 7]`            | 3 | tbd    | see "zero die" below                  |

### Zero die — open question

`AETHER_MODE.diceRange` is `-10..32` which technically includes `0`.
A `0` die is degenerate: `0^p = 0` for `p > 0`, `0^0 = 1`, dividing by
`0` is excluded by `isFinite`. The current solver doesn't crash on it
but a 0-die rolls almost never produces interesting equations.

**Recommendation:** ban `0` from the dice ranges by tightening
`diceRange` to `{ min: -10, max: 32, exclude: [0] }` (new field) or
add a `mode.legalDieValue(d)` predicate. Cleaner than scattering
"is it zero" checks.

### What changes

1. New module `src/core/legality.ts`:
   - `isLegalDiceTuple(dice: readonly number[], mode: Mode): boolean`
   - Encapsulates the ≤1-ones, ≤(N−1)-of-a-kind, and value-range checks
2. `isLegalDiceTriple` becomes a 3-arity wrapper for backwards compat.
3. `DICE_COMBINATIONS` regenerated using the unified predicate (no
   change to its contents — same rule, same result).
4. New `enumerateLegalTuples(arity, mode)` for the curator (replaces
   the standalone bake-blob script's ad hoc loops).
5. Lookup picker (`AetherLookupView`) refuses to accept illegal
   tuples; reports "this roll isn't possible — try …" instead of
   spinning the worker on an impossible input.

### Test plan
- Unit table over the worked examples above.
- Property test: `isLegalDiceTriple(t) === isLegalDiceTuple(t, STANDARD_MODE)` for every triple in `DICE_COMBINATIONS`.

---

## B. Solver perf — three layered wins

### B1. Branch-and-bound `easiestSolutionForCell`

The current `easiestSolution` calls `sweepOneTuple` against a
`[total, total]` range, which still enumerates *every* (perm, exps,
ops) and computes difficulty for every hit. We then take the min.

**The B&B version** maintains `bestDiff` as a running upper bound. For
each enumeration prefix it computes a **cheap difficulty lower bound**
that any completion must reach, and skips the subtree if the bound ≥
`bestDiff`.

What the lower bound can use cheaply (all from the prefix alone):

- `totalMagnitude` — known; depends only on `total`, constant per call
- `negTerm`, `arityTerm`, `hugeExpTerm` — known once exps are picked
- `largestSqrtTerm` lower bound — `sqrt(maxAbs so far)` only grows
- `largestDistanceTerm` lower bound — once `acc` walks past `total`
  in either direction, `largestNum` ≥ `acc`, so distance ≥ |acc−total|
- `multiplierTerm` — accumulates monotonically as `*` ops fire

What's only known at the leaf:

- `shortestDistanceTerm` — needs the full `allBases` set, which is
  fixed per dice multiset → can be computed once per call, not per
  candidate
- `zeroes`/`ones` — additive bonuses, reduce difficulty, so excluding
  them makes the bound a valid lower bound (we'll find no-bonus
  candidates "harder" than they are; that's safe for pruning)

**Search ordering** (find good solutions early so pruning bites):

- Try **op-tuples in order of cheapness**: pure `+`/`-` first, then
  with one `*`, etc. Mul chains are expensive in the difficulty model.
- Try **exp-tuples low-first** (`0`s and `1`s first) — those carry
  huge bonuses in the difficulty model.
- Try **perms in canonical-then-symmetry order** (see B2).

**Expected speedup:**
- Arity 3: 2–10× (already fast, less to gain)
- Arity 4: 10–50×
- Arity 5: 50–500× on cells with many solutions

**Risk:** if the lower bound is too loose, we don't prune; if it's
too tight, we incorrectly skip. Test against a regression set: for
1000 random (dice, target) tuples, B&B and brute-force must agree on
the easiest equation.

### B2. Canonical-form deduplication

User insight: most permutations of the same equation produce the same
difficulty, because difficulty depends on the LTR `acc` walk and many
op-tuples are commutative within spans.

**Definition.** Two equations are *canonical-equivalent* if they
produce the same `acc` walk after reordering operands within each
maximal commutative span. Spans:

- Maximal runs of `+`/`-` with operands kept by sign (because `a − b
  + c = c − b + a = a + c − b` but ≠ `b − a + c`)
- Maximal runs of `*`/`÷` similarly (operands kept by reciprocity)

**Canonical form rule:** within each span, sort operands by
(value DESC, exp DESC) of their effective base power. Stable
tiebreaker.

**Why this works:**
- Within a `+`/`-` span, swapping two `+` operands doesn't change the
  walk's max-abs intermediate (since the running sum hits the same
  set of values, just in different order — and `largestNum` is the
  *max* of those intermediates, which is invariant under reordering
  within a commutative span). Difficulty is identical.
- Same for `*`/`÷`: smallest-multiplicand at each `*` is a multiset
  property of the operands in the span.
- Across spans (e.g. `a + b * c`): operands move only within spans,
  not across, so the cross-span structure is preserved.

**Important:** This is *not* the same as "permutation-equivalent in
the multiset sense". `[2, 3, 5]` with `+ +` collapses to one canonical
form. But `[2, 3, 5]` with `+ *` (= `2 + 3 * 5 = 25`) and `[5, 3, 2]`
with `+ *` (= `5 + 3 * 2 = 16`) are different equations with different
totals, and stay separate.

**Implementation:** rather than enumerating perms then deduping, the
new solver enumerates **op-tuples first**, then for each op-tuple
generates only **canonical operand assignments** for each span. Pure
B&B on a much smaller search space.

**Speedup vs B1 alone:** for "easiest equation" we benefit because
B&B finds the canonical form first and prunes the rest. For "all
equations" panel we benefit because the list literally becomes
shorter — no more 6 cosmetic re-orderings of `2 + 3 + 5 = 10`.

**User-visible behavior change:** the "All equations for this cell"
panel will show fewer entries (the *meaningful* ones). Standard-mode
example for `[2,3,5] = 40`:
- Before: 44 entries (many cosmetic perms)
- After: ~10–15 entries (each genuinely different)

This is the "regen `standard.n2k`" event. User has approved.

### B3. Cheap inner-loop wins

While we're rewriting the hot loop:

1. **`safeMagnitude` early-prune in `pickExp`** — currently only
   checked in `tryAllOps` after every exponent is picked. Move into
   `pickExp` so we abort whole subtrees when a single base value
   already exceeds `safeMagnitude`. Cuts arity-5 high-cap dice (e.g.
   `[2, 2, 2, 2, 2]` with cap 20 each → 21^5 = 4M exp-tuples) by an
   order of magnitude.
2. **Precompute `applyOperator` inline.** The switch dispatch shows
   up in profiles for arity-5 sweeps. Inline 4 cases in
   `enumerateForPermutation`'s `tryAllOps` only (keep the public
   `applyOperator` function for other callers).
3. **Drop the `Number.isFinite` check after `+`/`-`/`*`** — only
   `/` can produce non-finite. Branch out the `÷` case.
4. **Skip `*` chain decay computation when `multiplierChainDecay`
   is false** (standard mode). One less branch per `*` iteration.

**Expected:** another 1.5–3× on top of B1+B2.

---

## C. `.n2k` v2 format — "go crazy with optimization"

The current v1 format is already quite tight (varints, bit packing,
shared exponent width). v2 targets specific structural waste and
adds arity-4/5 capability cleanly.

### What v1 already does well

- Bit-packed permutation indices (saves 2–4 bits per record vs full)
- Shared exp-bits across the dice multiset (reflects the cap is per-
  value, not per-position)
- `targetDelta` varint (sequential targets compress from 13 bits to
  ~3 bits each)
- `diff100` as varint (most difficulties are 2-byte)

### What v1 wastes

1. **Per-record `permIndex` is huge for arity 5.** `5! = 120` perms
   = 7 bits per record. With ~3500 records per arity-5 chunk that's
   ~3 KB just for perm indices.
   - **v2 fix:** with canonical-form dedup (B2), the equation's
     dice arrangement *is* the canonical form derived from the
     op-tuple and operand assignment. Perm index goes away entirely.
     Saves ~7 bits/record.

2. **Op-tuple stored as 2-bit-per-op without a dictionary.** For
   arity 5, 4^4 = 256 distinct op-tuples per chunk, but in practice
   only ~30–80 are *used* (most cells solved by the same handful of
   shapes).
   - **v2 fix:** chunk-level op-tuple dictionary. Header lists the
     `K` distinct op-tuples actually used in this chunk; each record
     stores `bitsForRange(K-1)` bits instead of `2*(arity-1)`.
     Arity-5 average: 4–6 bits → 2–3 bits per record. Saves ~3 bits.

3. **Difficulty stored as full uvarint per record.** Most difficulties
   sit in narrow bands per dice multiset. The values are very
   correlated cell-to-cell.
   - **v2 fix:** delta-encode difficulty against a chunk-level
     baseline (median or first-record). Most deltas fit in 1–2 bytes
     instead of the full uvarint width. Saves ~1 byte/record on
     average.

4. **Exponent tuples don't share structure.** The same (or near-same)
   exps appear repeatedly across nearby targets. We just bit-pack
   each independently.
   - **v2 fix:** chunk-level exp-tuple dictionary, same trick as
     op-tuples. Saves another ~5 bits/record for arity 5.

5. **No header-level "always 0 exponent" hint.** When all records in
   a chunk happen to have a certain slot always at exp 0 or 1, we
   still spend the full bits on it.
   - **v2 fix:** per-slot "constant exp" header bit. If set, skip the
     per-record exp for that slot; emit the constant once in header.

6. **No frame-of-reference compression for `total`.** `targetDelta`
   already does this for sequential records, but the *gap pattern*
   (most records are +1 or +2 deltas; occasional jumps) could be
   single-bit encoded.
   - **v2 fix:** "small-delta" prefix bit. 0 = "delta is 1" (the
     overwhelming common case), 1 = "uvarint follows". Saves ~6
     bits/record on dense chunks.

7. **Whole-blob compression.** Currently we don't gzip the `.n2k`
   blob — relying on per-record bit packing alone.
   - **v2 fix:** the bake script gzips the final blob. Loader does
     `DecompressionStream("gzip")`. With the redundancy that's left
     after bit-packing, expected 1.5–2× additional shrink.

### v2 wire layout (sketch — finalize during implementation)

```
chunk:
  magic            "N2K2" (4B, distinguishes v2)
  version          1B uint8
  modeId           1 bit
  arity            3 bits
  flags            4 bits   bit0: hasExpDict, bit1: hasOpDict,
                            bit2: diffDelta, bit3: smallDeltaTotal
  dice[arity]      zigzag varints
  targetMin        uvarint
  targetMax        uvarint
  count            uvarint
  diffBaseline     uvarint  (only if flags.diffDelta)

  expConst[arity]  per slot: 1 bit "isConst" + (if 1) sharedExpBits "value"

  opDictSize       uvarint  (only if flags.hasOpDict)
  opDict[K]        2 bits/op × (arity-1) per entry
  expDictSize      uvarint  (only if flags.hasExpDict)
  expDict[M]       sharedExpBits/exp × (non-const slots) per entry

  records[count]:
    [smallDelta]   1 bit if flags.smallDeltaTotal; if 0, delta=1
    [bigDelta]     uvarint if smallDelta=1 or flag off
    expIdx         bitsForRange(M-1) if hasExpDict, else inline exps
    opIdx          bitsForRange(K-1) if hasOpDict, else inline ops
    [diffDelta]    svarint (signed, against running median) if flag on
    [diff100]      uvarint if flag off
```

The encoder picks flags per chunk based on what gives the smallest
output (try with/without dictionaries, keep the shorter).

### Aggregate blob

v1 blob is a flat concatenation of chunks with no header. The loader
parses each chunk's varints to figure out where the next one starts —
a sequential `byteLengthOfChunk` walk. This means **the loader cannot
seek** to a specific tuple's chunk without parsing every chunk before
it. For arity-5 with ~5k chunks that's ~5 MB of bit-walking on every
load.

**v2 fix:** add a true blob header with a chunk index:

```
blob:
  magic            "N2KB" (4B)
  version          1B uint8
  chunkCount       uvarint
  index:           chunkCount entries:
    diceTuple      arity zigzag varints (sorted ascending)
    chunkOffset    uvarint (byte offset from start of blob)
    chunkBytes     uvarint
  chunks:          back-to-back v2 chunks
```

Loader parses just the header (small, ~50 KB for 5k chunks) and can
then `fetch` (or `Range`-request) only the needed chunk bytes. For
the bundled-blob case (no Range support), the index still lets us
seek directly to the chunk without bit-walking the prior ones.

**Bonus:** the index is the natural place to ship the curated-blob
*coverage map* — the picker can grey-out tuples not in the blob and
say "lookup will use the worker for this roll".

### Expected size — measured math

For one arity-5 chunk on common dice (`[2, 3, 5, 7, 11]`, ~3500
solvable targets):

| Component        | v1 bytes  | v2 bytes  | savings |
|------------------|-----------|-----------|---------|
| header           | ~15       | ~25       | -10     |
| op dict          | n/a       | ~10       | -10     |
| exp dict         | n/a       | ~30       | -30     |
| const-exp header | n/a       | ~5        | -5      |
| per-record perm  | ~3000     | 0         | +3000   |
| per-record op    | ~3500     | ~1500     | +2000   |
| per-record exp   | ~5500     | ~3000     | +2500   |
| per-record total | ~3500     | ~1500     | +2000   |
| per-record diff  | ~7000     | ~4500     | +2500   |
| **chunk total**  | **~22 KB**| **~10 KB**| **~55%**|

Add gzip on the whole blob: another 1.5×. **Expected v2 chunk size on
common dice: ~6–7 KB compressed** (vs ~22 KB v1 uncompressed).

### C.5 — Additional v2++ optimizations (added 2026-04-19)

The optimizations in C above are "obvious wins". This section adds
five more aggressive ones that compound for another ~2× chunk shrink.
All are still single-pass, no decoder complexity blow-up.

#### C.5.1 Cross-chunk (blob-level) dictionary

Op-tuples like `[+, +, +, +]` and exp-tuples like `[1, 1, 1, 1, 1]`
appear in *every* arity-5 chunk. Currently each chunk redeclares them
in its local dict.

**v2++ fix:** the blob header carries a **shared op-dictionary** and
a **shared exp-dictionary** containing the entries that appear in
≥ K% of chunks (K configurable; expected ~50 entries per dict). Each
chunk's local dict only needs to store the entries unique to it.
Records reference `globalIdx | (localIdx + globalCount)` in a single
combined namespace.

**Saves:** ~15–25 bytes per chunk (no local re-declarations of common
entries) × 5k chunks = **~100 KB per blob** before compression.

#### C.5.2 "Same shape as previous" record bit

Adjacent records (consecutive solvable targets) frequently share
their `(opIdx, expIdx)` and differ only in `total` and `difficulty`.
Empirically expected to apply to 30–60% of arity-5 records.

**v2++ encoding:** prepend each record with 1 bit:
- `0` = "shape carries over from previous record"; emit only the
  `target-delta` and `diff-delta` payload
- `1` = "full record follows" (the v2 path)

**Saves:** ~10 bits per "carry-over" record on arity-5 (the saved
opIdx+expIdx). At 50% carry-over rate × 3500 records × 10 bits =
**~2 KB per chunk**.

#### C.5.3 Bitmap-keyed records (replaces target-delta varints)

Currently records carry `target-delta` varints to encode which target
each row belongs to. For sparse arity-5 chunks (target solvability
~70%, gaps unpredictable) the deltas vary wildly and each costs 1–2
bytes.

**v2++ fix:** each chunk stores a **bitmap** of length
`(targetMax - targetMin + 1)` bits, one per target, set iff the
target is solvable. The records are then a dense array indexed by
bitmap rank; no per-record total field at all. The decoder uses
rank/select on the bitmap to map `target → record index` in O(1)
amortized after a small precomputed-prefix step.

**Cost:** 5,000 bits per chunk = 625 B header.
**Saves:** removes the per-record target-delta uvarint
(~3500 × ~5 bits) = ~2.2 KB per chunk.
**Net:** ~1.5 KB per chunk **plus** O(1) `lookupByTarget()` in the
decoder (currently linear scan).

This last benefit matters: the Lookup view's hot path is "given a
specific target, find that one record". Today it walks records
sequentially; under v2++ it's a bitmap rank + array index.

#### C.5.4 Adaptive difficulty quantization

Currently `diff100 = round(diff * 100)` → uvarint (typically 2 bytes).
Most chunks have all difficulties within a tight band (e.g. all in
[4.5, 8.2]); the upper end of the uvarint range is wasted.

**v2++ fix:** chunk header carries `diffMin100`, `diffMax100`. Per
record stores `bitsForRange(diffMax100 - diffMin100)` bits — typically
9–10 bits per record, vs ~16 bits for the uvarint.

**Saves:** ~6 bits/record × 3500 = ~2.5 KB per chunk.

#### C.5.5 Brotli (when available) over gzip

Browsers expose `DecompressionStream("gzip")` universally; Brotli is
universal as a `Content-Encoding` (server side) but only some
browsers expose it via `DecompressionStream`. We can sidestep this
by:

1. Bake script produces `.n2k.br` and `.n2k.gz` side by side.
2. Loader fetches `.n2k.br` first; on 404/decode-error falls back to
   `.n2k.gz`.
3. Or, if hosted behind any modern CDN (Firebase Hosting, Cloudflare,
   etc.), let the CDN do `Accept-Encoding: br` negotiation
   transparently — we ship `.n2k` (uncompressed-on-disk-but-served-
   compressed) and let the network do its job.

**Saves:** ~15–25% additional vs gzip. Free.

### C.6 — Updated wire layout (v2++)

```
blob:
  magic            "N2KB" (4B)
  version          2B uint16     (v2 = 2; v2++ uses same magic, version=3)
  chunkCount       uvarint
  globalOpDictSize uvarint
  globalOpDict[*]  2 bits/op × (arity-1) per entry
                   (one dict per arity, repeated as needed)
  globalExpDictSize uvarint
  globalExpDict[*] sharedExpBits/exp × arity per entry
  index:           chunkCount entries:
    diceTuple      arity zigzag varints (sorted ascending)
    chunkOffset    uvarint
    chunkBytes     uvarint
  chunks:          back-to-back v2++ chunks

chunk:
  magic            "N2K2" (4B)
  version          1B uint8       (v2++ = 3)
  modeId           1 bit
  arity            3 bits
  flags            12 bits        (room to grow; covers all v2++ knobs)
  dice[arity]      zigzag varints
  targetMin        uvarint
  targetMax        uvarint
  count            uvarint
  diffMin100       uvarint
  diffRangeBits    1B             (bits per record difficulty)

  bitmap           (targetMax-targetMin+1) bits  (1 = solvable)

  expConst[arity]  per slot: 1 bit isConst + (if 1) sharedExpBits value
  localOpDictSize  uvarint
  localOpDict[*]   2 bits/op × (arity-1) per entry
  localExpDictSize uvarint
  localExpDict[*]  sharedExpBits/exp × (non-const slots) per entry

  records[count]:  (in bitmap-rank order; no target field)
    sameShape      1 bit
    if !sameShape:
      opIdx        bitsForRange(globalOpDictSize + localOpDictSize - 1)
      expIdx       bitsForRange(globalExpDictSize + localExpDictSize - 1)
    diff           diffRangeBits  (offset from diffMin100)
```

### C.7 — Storage plan with three-tier curation

Per user steer (2026-04-19):

> **Commons rule:** dice ∈ {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15,
> 20} (13 values), no `1`s, **at most 2 of any value**. Stricter than
> the legality rule (which allows 1 one and ≤(N−1)-of-a-kind);
> commons are the curated subset.
>
> Above-commons rolls fall through to the worker — which is now fast
> enough (B&B + canonical solver, target <500ms for arity 5) that
> the gap is not user-visible.

**Tier 1 — Commons** (ships in v1 of this work):
- Arity 4: ~1,650 tuples × ~3 KB = **~5 MB compressed**
- Arity 5: ~5,000 tuples × ~3 KB = **~15 MB compressed**
- Standard regen (v2++): ~3 MB → **~1.5 MB compressed**
- **Total: ~20 MB.** Eager-load the standard blob; lazy-load the
  Æther blobs on first Æther use.

**Tier 2 — Extended** (stretch goal, post-v1; bake script ready but
not shipped):
- Adds dice values {13, 14, 16, 17, 18, 19} → 19 values total
- Same "≤ 2 of any" / "no 1s" rule
- Arity 4: ~7,000 tuples × ~3 KB = **~20 MB compressed**
- Arity 5: ~30,000 tuples × ~3 KB = **~90 MB compressed**
- **Total: ~110 MB.** Opt-in via a settings toggle ("Download
  extended Æther index"). Or we ship it as code-split chunks
  triggered by hitting a Tier-2 tuple.

**Tier 3 — Edge cases** (worker-only forever):
- 3+-of-a-kind rolls (legal but rare)
- Rolls with a `1`
- Negative dice
- Dice values outside {2..20}
- Worker handles these in <1s with B&B + canonical solver. No blob.

**Total Tier-1 bundle: ~20 MB.** Acceptable for code-split. Tier 2 is
queued in the bake script, decision deferred to post-v1 measurement.

### C.8 — Per-chunk size estimate (v2++)

Updated table for one arity-5 chunk on common dice (~3500 solvable
targets):

| Component             | v1 bytes  | v2 bytes  | v2++ bytes |
|-----------------------|-----------|-----------|------------|
| chunk header          | ~15       | ~25       | ~30        |
| bitmap                | n/a       | n/a       | ~625       |
| local op dict         | n/a       | ~10       | ~3 (rest in global) |
| local exp dict        | n/a       | ~30       | ~8 (rest in global) |
| const-exp header      | n/a       | ~5        | ~5         |
| per-record perm       | ~3000     | 0         | 0          |
| per-record op         | ~3500     | ~1500     | ~700 (sameShape removes most) |
| per-record exp        | ~5500     | ~3000     | ~1400 (same) |
| per-record total      | ~3500     | ~1500     | 0 (bitmap) |
| per-record diff       | ~7000     | ~4500     | ~2500 (adaptive) |
| per-record sameShape  | n/a       | n/a       | ~440       |
| **chunk total**       | **~22 KB**| **~10 KB**| **~5 KB**  |
| after Brotli          | n/a       | ~6 KB     | **~3 KB**  |

**Net:** v2++ chunks are ~3 KB vs v1's ~22 KB → **~7× smaller before
gzip, ~10× after Brotli.** That's the slack we use to ship arity-4 +
arity-5 commons in only ~20 MB.

---

## D. Lookup UI for arity 4/5

Per user steer:

- **Replace "All equations for this cell"** with **"Show more
  equations"**. Initial render shows top-K from the worker (or blob,
  if covered). Click loads the next batch. Worker yields incrementally.
- **Sort ascending by difficulty** within and across batches.
- **Collapse perm-equivalent entries** (canonical form, applies to
  arity 3 too — small list with badge "× N orderings" if user wants
  to peek).

Worker contract change:

```ts
interface SolveAllRequest {
  id: number;
  dice: readonly number[];
  total: number;
  cursor?: number;          // resume from here
  batchSize: number;        // how many to send back
}
interface SolveAllResponse {
  id: number;
  kind: "batch" | "done" | "error";
  solutions: readonly { equation: string; difficulty: number }[];
  cursor?: number;          // where to resume from
  totalSoFar: number;       // running count
}
```

The worker does B&B internally. It maintains a priority queue of
candidates ordered by difficulty. Each `batch` request drains up to
`batchSize` from the top of the queue. When the search is exhausted,
sends `kind: "done"`.

For the **headline easiest equation** (the `<Equation>` at the top of
the Lookup view), the worker has a fast-path: B&B for top-1, return
within a few ms. For the inline list, the same B&B continues from the
same cursor for the next batch.

---

## E. Execution order

Each step is mergeable on its own; we don't end up with a half-
working solver in `main`.

### Phase 1 — Foundations (~2 days)

1. `src/core/legality.ts` — `isLegalDiceTuple` + tests (table-driven).
2. `enumerateLegalTuples(arity, mode)` — replaces standalone bake
   loops. Verify against `DICE_COMBINATIONS` for arity 3.
3. **Measure baseline.** Add `npm run bench:solver` that runs a fixed
   set of (dice, target) lookups and dumps timings. Record current
   numbers in `docs/changelog.md` before any optimization. This is
   the regression check for everything that follows.

### Phase 2 — Solver perf (~3–4 days)

4. **B3 first** (cheap inner-loop wins). Validate against the bench
   suite; expect ~2× across the board.
5. **B2: canonical-form solver.** New `solver/canonical.ts` that
   enumerates op-tuple-first and emits canonical-form equations only.
   Old `solver.ts` stays for now (callers gradually migrate).
   Property test: for 1000 random (dice, total) tuples, the set of
   canonical-form solutions must equal `dedupCanonical(allSolutions(
   …, oldSolver))`.
6. **B1: branch-and-bound** layered on the canonical solver. New
   `easiestSolutionBnB`. Property test: result equation total + diff
   matches `easiestSolution` for 5000 random tuples (under canonical
   equivalence).
7. **Migrate callers** from `easiestSolution` → `easiestSolutionBnB`.
   Remove old `solver.ts` paths once the bench shows uniform wins.

### Phase 3 — `.n2k` v2++ format (~3–4 days)

8. **`src/core/n2kBinary2.ts`** — new chunk encoder/decoder.
   Magic `N2K2`, version byte `3` (v2++ on the wire). Implements
   C.5.1–C.5.4 (cross-chunk dict refs, sameShape bit, bitmap-keyed
   records, adaptive difficulty). Property test: encode→decode
   round-trips for 1000 random chunks; bitmap rank/select correct
   under fuzzing.
9. **`src/core/n2kBlob2.ts`** — blob header with index + global op
   and exp dictionaries. Magic `N2KB`. Loader can pick chunks by
   index without scanning. Brotli-decompress when content-encoded.
10. **`src/core/dictBuilder.ts`** — pre-pass over a candidate set of
    chunks that picks which op-tuples and exp-tuples graduate to the
    global dictionary (frequency threshold; verify global dict
    overhead beats per-chunk savings).
11. **Bake script v2++** — `scripts/bake-blob.ts` extended:
    - `--format v1|v2` (default v2)
    - `--arity 3|4|5`
    - `--tier commons|extended|all|<custom>` (commons by default)
    - `--compression none|gzip|brotli` (brotli default)
    - Outputs `<mode>-arity<N>-<tier>.n2k(.br|.gz)` —
      e.g. `aether-arity5-commons.n2k.br`

### Phase 4 — UI integration (~1–2 days)

11. **Loader** — `web/src/services/n2kLoader.ts` learns about v2 +
    blob index. Lazy-loads arity-4/5 blobs on first Æther use.
12. **AetherLookupView** — uses blob first, worker fallback.
    Shows "from cache (instant)" vs "computing…" affordance.
13. **AllEquationsList** — switches to streaming "show more" with
    cursor protocol.

### Phase 5 — Regen + cleanup (~1 day)

14. Regenerate `standard.n2k` under v2. Diff old vs new equation
    outputs (canonical-form changes); document the user-visible
    delta in changelog.
15. Bake `aether-arity4-common.n2k` and `aether-arity5-common.n2k`.
    Verify size targets met.
16. Remove v1 codec + old solver paths after a deprecation cycle (or
    immediately if no external consumers).

**Total estimate:** ~9–12 days of focused work.

---

## F. Decisions — locked in 2026-04-19

All open questions answered by the user during planning:

1. **Commons curation rule:** dice ∈ {2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
   12, 15, 20} (13 values). **No `1`s in commons. At most 2 of any
   value in commons.** (Stricter than the legality rule, which
   allows 1 one and ≤(N−1)-of-a-kind. Commons is a curated subset;
   legality is the universe the worker covers.) See C.7 for tier
   structure.

2. **`0` die:** banned at the `Mode` level via a new
   `legalDieValue(d)` predicate; range becomes `-10..32 \ {0}` for
   Æther. Standard mode unaffected.

3. **Worker streaming:** **cursor-based.** Worker maintains a
   priority queue of canonical-form solutions ranked by difficulty;
   each `getNextBatch(cursor, batchSize)` request drains up to
   `batchSize` from the top.

4. **Canonical-form ordering convention:** **smallest-first within a
   commutative span.** `2 + 3 + 5` (not `5 + 3 + 2`). Matches
   existing equation conventions in the codebase. The B2 canonical
   sort is `(effective base power ASC, then exp ASC)`.

5. **B&B lower bound:** new `difficultyLowerBound(prefix, mode)`
   alongside `difficultyOfEquation` in `difficulty.ts`. The contract
   `lowerBound(prefix) ≤ difficulty(any completion of prefix)` is
   asserted in tests for 1000 random prefixes per mode.

---

## G. Risk register

| Risk | Mitigation |
|------|------------|
| B&B lower bound is unsound → solver returns sub-optimal | Property test against brute force on 5000 random tuples |
| Canonical-form rule misses an equivalence | Property test: canonical(canonical(eq)) = canonical(eq); plus the differential test in step 5 |
| v2 format ends up *bigger* than v1 on some chunks | Encoder picks flags per-chunk; falls back to no-dict when dict overhead > savings |
| Curated blob misses the user's actual rolls often | Add telemetry-light "blob hit rate" counter; if <80%, expand the dice set |
| Regen breaks Compose / Library docs that store equations as strings | Audit storage formats; equations stored as printed strings still parse the same way (canonical form is a re-render concern, not a parse concern) |
| Worker B&B starves for hard cells | Add a wall-clock timeout per request; on timeout, emit best-so-far + "search incomplete" affordance |

---

## H. What we get when it's done

- **Æther lookup feels instant** for the common 80% of rolls (Tier-1
  blob hit; <50ms perceived) and "fast" (under 1s) for everything
  else (B&B worker with canonical solver).
- **Standard blob shrinks ~2×** (current ~3 MB → ~1.5 MB) under
  v2++.
- **Two new Æther blobs** (arity-4 commons ~5 MB, arity-5 commons
  ~15 MB) covering the curated dice tier; lazy-loaded on first Æther
  use. Tier 2 (~110 MB extended) ready in the bake script for opt-in
  later.
- **`.n2k` v2++ format** documented, future-proof, and used by every
  shipped blob. Chunks are ~10× smaller than v1. The format also
  enables **O(1) `lookupByTarget()`** in the decoder via bitmap
  rank/select.
- **Honest legality predicate** (`isLegalDiceTuple`) shared by the
  picker, the candidate generator, and the curator.
- **The "All equations" panel becomes useful** — canonical-form
  dedup means it shows meaningfully different equations, not 44
  cosmetic perms.
- **The solver is faster for everyone** — B&B + canonical-form +
  inner-loop wins compound to a 50–500× speedup on `easiestSolution`
  for arity 4/5.

Phase 1 starting.
