/**
 * Count plus noun with the right number: `plural(1, "cell")` is
 * "1 cell", `plural(3, "cell")` is "3 cells". Pass `many` for
 * irregular nouns.
 */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
