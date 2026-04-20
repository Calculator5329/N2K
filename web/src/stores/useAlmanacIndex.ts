/**
 * Read-only access to the dataset index used by the masthead stats
 * strip in the page-shell layouts.
 *
 * Behavior:
 *   - Standard mode: returns the raw `data.index` (1,540 triples,
 *     targets 1..720 — the precomputed bundled dataset).
 *   - Æther mode: synthesises a `DatasetIndex` envelope describing the
 *     addressable Æther universe (1.71M tuples across arity 3-5,
 *     targets 1..5,000). The platform solves these on-demand through a
 *     worker pool — there's no precomputed catalog — so the values
 *     describe the universe rather than disk-resident records. The
 *     `generatedAt` timestamp is carried over from the standard index
 *     so the "Compiled" stat keeps showing a meaningful date instead
 *     of `now`.
 *
 * This is an observer-friendly facade: every layout that reads
 * `index.value.diceTriplesTotal` etc. automatically updates when the
 * Konami code is entered (or Æther is toggled off).
 */
import type { DatasetIndex, Loadable } from "../core/types.js";
import { useAppStore } from "./AppStoreContext.js";

/**
 * Total Æther tuple universe across arity 3-5, with dice in the
 * advanced range [-10..32] (43 values per slot). Computed via the
 * stars-and-bars / "multichoose" closed form C(n+k-1, k):
 *   - arity 3: C(45, 3) =    14,190
 *   - arity 4: C(46, 4) =   163,185
 *   - arity 5: C(47, 5) = 1,533,939
 *   Total                 1,711,314
 *
 * Inlined as a constant so layouts don't pay an enumeration cost.
 */
const AETHER_UNIVERSE_TUPLES = 1_711_314;

/**
 * Æther target range (`ADV_TARGET_RANGE` in `core/constants.ts`).
 * Inlined here to avoid importing a runtime module just for two ints.
 */
const AETHER_TARGET_MIN = 1;
const AETHER_TARGET_MAX = 5_000;

function buildAetherIndex(base: DatasetIndex | null): DatasetIndex {
  return {
    generatedAt: base?.generatedAt ?? new Date().toISOString(),
    diceMin: -10,
    diceMax: 32,
    totalMin: AETHER_TARGET_MIN,
    totalMax: AETHER_TARGET_MAX,
    depower: false,
    recordsWritten: AETHER_UNIVERSE_TUPLES,
    diceTriplesTotal: AETHER_UNIVERSE_TUPLES,
    dice: [],
  };
}

/**
 * Note: this hook is intentionally NOT wrapped in `observer()` —
 * `observer` is for React components, not hooks. MobX reactivity flows
 * through the *calling* component, which is already an `observer()`
 * (every layout is). Reads of `secret.aetherActive` and `data.index`
 * become tracked dependencies of the consuming component, so the stats
 * line auto-updates when either flips.
 */
export function useAlmanacIndex(): Loadable<DatasetIndex> {
  const { data, secret } = useAppStore();

  if (secret.aetherActive) {
    const base = data.index.status === "ready" ? data.index.value : null;
    return { status: "ready", value: buildAetherIndex(base) };
  }

  return data.index;
}
