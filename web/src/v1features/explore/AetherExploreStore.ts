import { makeAutoObservable } from "mobx";
import { ADV_DICE_RANGE } from "@solver/core/constants.js";
import type { AetherArity, AetherTuple } from "../../core/types";
import { AETHER_SAMPLE } from "../../v1services/aetherSample";
import { tupleKey } from "../../v1stores/AetherDataStore";

export type AetherSortField =
  | "tuple"
  | "arity"
  | "solvable"
  | "easiest"
  | "hardest"
  | "average"
  | "median";

export type SortDir = "asc" | "desc";

export type ArityFilter = "all" | AetherArity;

export const PAGE_SIZE = 25;

/**
 * UI state for the Æther Explore table.
 *
 * Holds search query, arity filter, sort field/direction, and page
 * index. `tuples` is a derived list — the canonical 1000-tuple
 * sample, optionally filtered/searched, with the user-supplied search
 * tuple inserted at the top when it doesn't appear in the sample.
 *
 * Sort by stat fields (solvable / easiest / etc) requires sweep data
 * to be computed; the actual sort is applied in the view since the
 * store doesn't have direct access to `AetherDataStore`. The store
 * simply remembers the user's preference so re-renders are cheap.
 */
export class AetherExploreStore {
  query = "";
  arityFilter: ArityFilter = "all";
  sortField: AetherSortField = "tuple";
  sortDir: SortDir = "asc";
  page = 0;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setQuery(q: string): void {
    this.query = q;
    this.page = 0;
  }

  setArityFilter(a: ArityFilter): void {
    this.arityFilter = a;
    this.page = 0;
  }

  setSort(field: AetherSortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortField = field;
      this.sortDir = field === "tuple" || field === "arity" ? "asc" : "desc";
    }
  }

  setPage(p: number): void {
    this.page = Math.max(0, p);
  }

  /**
   * The query parsed as an explicit Æther tuple, when the user has
   * typed something that looks like one (e.g. `2 3 5` or `-1, 7, 11`).
   * Returns `null` if the input doesn't unambiguously parse.
   */
  get queryTuple(): AetherTuple | null {
    const trimmed = this.query.trim();
    if (trimmed.length === 0) return null;
    const parts = trimmed
      .split(/[\s,;]+/)
      .filter((s) => s.length > 0)
      .map((s) => Number(s));
    if (parts.length < 3 || parts.length > 5) return null;
    if (parts.some((n) => !Number.isFinite(n) || !Number.isInteger(n))) return null;
    if (parts.some((n) => n < ADV_DICE_RANGE.min || n > ADV_DICE_RANGE.max)) return null;
    return [...parts].sort((a, b) => a - b);
  }

  /**
   * The canonical sample, plus a user-supplied tuple injected at the
   * front when the search parses but isn't already in the sample.
   * Filtered by arity. NOT yet sorted by sweep stats — the view does
   * that once it has access to the data store.
   */
  get baseTuples(): readonly AetherTuple[] {
    const arity = this.arityFilter;
    const adhoc = this.queryTuple;
    let tuples: AetherTuple[] = [...AETHER_SAMPLE];
    if (arity !== "all") tuples = tuples.filter((t) => t.length === arity);
    if (adhoc !== null && (arity === "all" || adhoc.length === arity)) {
      const adhocKey = tupleKey(adhoc);
      const exists = tuples.some((t) => tupleKey(t) === adhocKey);
      if (!exists) tuples = [adhoc, ...tuples];
    }
    return tuples;
  }
}
