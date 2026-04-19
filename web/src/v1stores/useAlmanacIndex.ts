/**
 * Read-only access to the dataset index used by the masthead stats
 * strip in the ported v1 layouts.
 *
 * In v1 this hook merged the standard catalog with the Æther mode
 * synthetic index. v2 always solves on demand via a worker pool, so
 * the underlying numbers are constant — they describe the addressable
 * universe rather than a precomputed catalog. The v1 facade exposes
 * the right shape so layouts continue to render unchanged.
 */
import type { DatasetIndex, Loadable } from "../core/types.js";
import { useStore } from "./storeContext.js";

export function useAlmanacIndex(): Loadable<DatasetIndex> {
  const { data } = useStore();
  return data.index;
}
