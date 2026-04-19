import {
  autorun,
  makeAutoObservable,
  runInAction,
  type IReactionDisposer,
} from "mobx";
import { ADV_DICE_RANGE, ADV_TARGET_RANGE } from "@solver/core/constants.js";
import type { AetherArity, AetherTuple } from "../../core/types";
import {
  readHash,
  subscribeHash,
  writeHash,
  type HashSchema,
} from "../../v1services/urlHashState";

interface AetherLookupState {
  readonly arity: AetherArity;
  readonly dice: readonly number[];
  readonly total: number;
}

/**
 * Hash schema for the Æther variant of Lookup. Format:
 * `1:<arity>:d1,d2,…/total` — small but distinct from the standard
 * `lookup` key so the two modes don't clobber each other when a user
 * toggles the badge mid-session.
 */
const HASH_KEY = "alookup";
const HASH_SCHEMA: HashSchema<AetherLookupState> = {
  encode({ arity, dice, total }): string {
    return `1:${arity}:${dice.slice(0, arity).join(",")}/${total}`;
  },
  decode(raw): AetherLookupState | null {
    const m = /^1:([345]):(-?\d+(?:,-?\d+)+)\/(\d+)$/.exec(raw);
    if (m === null) return null;
    const arity = Number(m[1]) as AetherArity;
    const dice = m[2]!.split(",").map((s) => Number(s));
    if (dice.length !== arity) return null;
    if (dice.some((d) => !Number.isFinite(d))) return null;
    if (dice.some((d) => d < ADV_DICE_RANGE.min || d > ADV_DICE_RANGE.max)) {
      return null;
    }
    const total = Number(m[3]);
    if (
      !Number.isFinite(total) ||
      total < ADV_TARGET_RANGE.min ||
      total > ADV_TARGET_RANGE.max
    ) {
      return null;
    }
    return { arity, dice, total };
  },
};

function clampDie(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(
    ADV_DICE_RANGE.min,
    Math.min(ADV_DICE_RANGE.max, Math.round(value)),
  );
}

function clampTotal(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(
    ADV_TARGET_RANGE.min,
    Math.min(ADV_TARGET_RANGE.max, Math.round(value)),
  );
}

/**
 * Local UI state for the Æther variant of Lookup.
 *
 * Holds five die slots even when `arity` is 3 or 4 — keeping the values
 * persistent means flipping arity 3→5→3 round-trips back to the
 * original numbers, instead of losing two values to a default.
 *
 * `tuple` is always the canonical sorted form of the active slice,
 * matching the unordered-tuple semantics used by `AetherDataStore` so
 * cache lookups always hit.
 */
const DEFAULT_DICE = [2, 3, 5, 7, 11] as const;

export class AetherLookupStore {
  arity: AetherArity = 3;
  dice: number[] = [...DEFAULT_DICE];
  total = 100;

  constructor() {
    makeAutoObservable<AetherLookupStore, "hydrateFromHash">(this, {
      startSync: false,
      hydrateFromHash: false,
    });
    this.hydrateFromHash();
  }

  /**
   * Active dice slice, sorted ascending — the cache key form. Use
   * `displayDice` when the UI wants to show user-typed values in their
   * insertion order.
   */
  get tuple(): AetherTuple {
    return [...this.dice.slice(0, this.arity)].sort((a, b) => a - b);
  }

  /** Insertion-order view of the active dice (for input controls). */
  get displayDice(): readonly number[] {
    return this.dice.slice(0, this.arity);
  }

  setArity(arity: AetherArity): void {
    this.arity = arity;
  }

  setDie(index: number, value: number): void {
    if (index < 0 || index >= this.dice.length) return;
    const clamped = clampDie(value);
    if (clamped === null) return;
    this.dice[index] = clamped;
  }

  setTotal(value: number): void {
    const clamped = clampTotal(value);
    if (clamped === null) return;
    this.total = clamped;
  }

  startSync(): () => void {
    const writer: IReactionDisposer = autorun(() => {
      writeHash(
        HASH_KEY,
        { arity: this.arity, dice: this.tuple, total: this.total },
        HASH_SCHEMA,
      );
    });
    const unsubscribe = subscribeHash(() => this.hydrateFromHash());
    return () => {
      writer();
      unsubscribe();
    };
  }

  private hydrateFromHash(): void {
    const persisted = readHash(HASH_KEY, HASH_SCHEMA);
    if (persisted === null) return;
    runInAction(() => {
      this.arity = persisted.arity;
      // Replace the leading `arity` slots; preserve any deeper defaults.
      for (let i = 0; i < this.dice.length; i += 1) {
        this.dice[i] =
          i < persisted.dice.length ? persisted.dice[i]! : DEFAULT_DICE[i]!;
      }
      this.total = persisted.total;
    });
  }
}
