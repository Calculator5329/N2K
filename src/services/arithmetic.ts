/**
 * Arithmetic primitives shared by the solver and difficulty heuristic.
 *
 * Pure, stateless. No imports from `core/constants` so this module stays
 * tiny and easy to test in isolation.
 */
import { OP } from "../core/constants.js";
import type { Operator } from "../core/types.js";

/**
 * Apply an operator to two numbers. Throws on unknown operator codes so
 * invalid enumerations fail loudly instead of silently returning
 * `undefined`.
 */
export function applyOperator(a: number, b: number, op: Operator): number {
  switch (op) {
    case OP.ADD:
      return a + b;
    case OP.SUB:
      return a - b;
    case OP.MUL:
      return a * b;
    case OP.DIV:
      return a / b;
    default:
      throw new Error(`applyOperator: unknown operator ${String(op)}`);
  }
}

/**
 * Evaluate `values[0] ops[0] values[1] ops[1] values[2] ...` strictly
 * left-to-right (no operator precedence). Returns `NaN` when the chain
 * produces a non-finite intermediate (divide-by-zero) or any partial
 * result exceeds `safeMagnitude`.
 *
 * Returning `NaN` lets the solver `Number.isFinite`-skip without
 * throwing inside its hot loop.
 */
export function evaluateLeftToRight(
  values: readonly number[],
  ops: readonly Operator[],
  safeMagnitude: number = Number.POSITIVE_INFINITY,
): number {
  if (values.length === 0) return Number.NaN;
  if (ops.length !== values.length - 1) {
    throw new RangeError(
      `evaluateLeftToRight: ops.length (${ops.length}) must equal ` +
        `values.length - 1 (${values.length - 1})`,
    );
  }
  let acc = values[0]!;
  if (Math.abs(acc) > safeMagnitude) return Number.NaN;
  for (let i = 0; i < ops.length; i += 1) {
    acc = applyOperator(acc, values[i + 1]!, ops[i]!);
    if (!Number.isFinite(acc)) return Number.NaN;
    if (Math.abs(acc) > safeMagnitude) return Number.NaN;
  }
  return acc;
}

/**
 * Yield every permutation of `items` via Heap's algorithm. Yields fresh
 * arrays (callers may keep them); time complexity O(n! · n).
 *
 * For small N (3..5) this beats allocating-all upfront because callers
 * typically short-circuit the inner loop.
 */
export function* permutations<T>(
  items: readonly T[],
): Generator<readonly T[]> {
  const a = items.slice();
  const n = a.length;
  if (n === 0) {
    yield [];
    return;
  }
  yield a.slice();
  const c = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    if (c[i]! < i) {
      if ((i & 1) === 0) {
        const tmp = a[0]!;
        a[0] = a[i]!;
        a[i] = tmp;
      } else {
        const k = c[i]!;
        const tmp = a[k]!;
        a[k] = a[i]!;
        a[i] = tmp;
      }
      yield a.slice();
      c[i] = c[i]! + 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}

/**
 * Like {@link permutations} but skips duplicate orderings when `items`
 * contains repeated values. Yields exactly `n! / (n1! · n2! · …)` arrays
 * where `nk` is the count of each distinct value.
 *
 * Cuts the constant factor for ties — the common case in the solver
 * (e.g. `(2, 2, 2)` yields 1 result instead of 6). Items are compared
 * with `===`, so this is intended for primitives.
 */
export function* distinctPermutations<T>(
  items: readonly T[],
): Generator<readonly T[]> {
  const sorted = items.slice().sort((a, b) => {
    if (a === b) return 0;
    return (a as unknown as number) < (b as unknown as number) ? -1 : 1;
  });
  const n = sorted.length;
  const used = new Array<boolean>(n).fill(false);
  const current: T[] = [];

  function* recurse(): Generator<readonly T[]> {
    if (current.length === n) {
      yield current.slice();
      return;
    }
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      // Skip a duplicate value if the equal item to its left is unused —
      // forces left-to-right consumption of equal items, eliminating
      // duplicate orderings.
      if (i > 0 && sorted[i] === sorted[i - 1] && !used[i - 1]) continue;
      used[i] = true;
      current.push(sorted[i]!);
      yield* recurse();
      current.pop();
      used[i] = false;
    }
  }

  yield* recurse();
}

/**
 * Yield every unordered `k`-element subset of `items` (by index, so
 * duplicate values stay distinguishable). Subsets are returned as
 * arrays of values in their original positional order.
 */
export function* unorderedSubsets<T>(
  items: readonly T[],
  k: number,
): Generator<readonly T[]> {
  const n = items.length;
  if (k > n || k < 0) return;
  const idx: number[] = new Array(k);
  function* recurse(start: number, depth: number): Generator<readonly T[]> {
    if (depth === k) {
      yield idx.map((i) => items[i]!);
      return;
    }
    for (let i = start; i <= n - (k - depth); i += 1) {
      idx[depth] = i;
      yield* recurse(i + 1, depth + 1);
    }
  }
  yield* recurse(0, 0);
}

/**
 * Enumerate every unordered N-tuple `(a₁, a₂, ..., a_N)` with
 * `min ≤ a₁ ≤ a₂ ≤ ... ≤ a_N ≤ max`. Used by bulk-export drivers to
 * walk the canonical tuple list.
 */
export function enumerateUnorderedTuples(
  arity: number,
  min: number,
  max: number,
): number[][] {
  if (arity < 1) {
    throw new RangeError(`enumerateUnorderedTuples: arity must be >= 1 (got ${arity})`);
  }
  if (min > max) {
    throw new RangeError(`enumerateUnorderedTuples: min (${min}) > max (${max})`);
  }
  const out: number[][] = [];
  const cur: number[] = new Array(arity);
  function recurse(level: number, lo: number): void {
    if (level === arity) {
      out.push(cur.slice());
      return;
    }
    for (let v = lo; v <= max; v += 1) {
      cur[level] = v;
      recurse(level + 1, v);
    }
  }
  recurse(0, min);
  return out;
}

/**
 * Enumerate every operator tuple of length `n` (`4^n` total).
 * Used by the solver to walk every possible chain of operators.
 */
export function allOpTuples(n: number): Operator[][] {
  const out: Operator[][] = [];
  const cur: Operator[] = new Array(n);
  const ops: readonly Operator[] = [OP.ADD, OP.SUB, OP.MUL, OP.DIV];
  function recurse(i: number): void {
    if (i === n) {
      out.push(cur.slice());
      return;
    }
    for (const op of ops) {
      cur[i] = op;
      recurse(i + 1);
    }
  }
  recurse(0);
  return out;
}
