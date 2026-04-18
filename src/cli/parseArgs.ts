/**
 * Minimal argv parser. No yargs / commander.
 *
 * Supports:
 *   - long flags:        `--verbose`
 *   - long key/value:    `--mode aether` or `--mode=aether`
 *   - positional args:   `solve` `47`
 *   - end-of-options:    `--` (everything after is positional, even `--foo`)
 *
 * Boolean detection is delegated to consumers — every `--key` that has no
 * `=value` and is not followed by another arg (or is followed by another
 * `--key`) is parsed as a boolean `true`. Numbers stay strings — typed
 * coercion belongs in the command, not here.
 */

export interface ParsedArgs {
  /** Bare arguments before the first `--key`, plus anything after `--`. */
  readonly positionals: readonly string[];
  /** Long-form options. Repeated keys keep the last value. */
  readonly options: Readonly<Record<string, string | boolean>>;
}

export interface ParseArgsOptions {
  /** Keys whose value is always a boolean (consumed as `--flag`, never `--flag value`). */
  readonly booleanFlags?: readonly string[];
}

export function parseArgs(
  argv: readonly string[],
  options: ParseArgsOptions = {},
): ParsedArgs {
  const booleanFlags = new Set(options.booleanFlags ?? []);
  const positionals: string[] = [];
  const opts: Record<string, string | boolean> = {};

  let i = 0;
  let endOfOptions = false;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (endOfOptions) {
      positionals.push(tok);
      i += 1;
      continue;
    }
    if (tok === "--") {
      endOfOptions = true;
      i += 1;
      continue;
    }
    if (tok.startsWith("--")) {
      const body = tok.slice(2);
      if (body.length === 0) {
        positionals.push(tok);
        i += 1;
        continue;
      }
      const eq = body.indexOf("=");
      if (eq >= 0) {
        const key = body.slice(0, eq);
        const value = body.slice(eq + 1);
        opts[key] = value;
        i += 1;
        continue;
      }
      const key = body;
      if (booleanFlags.has(key)) {
        opts[key] = true;
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        opts[key] = true;
        i += 1;
        continue;
      }
      opts[key] = next;
      i += 2;
      continue;
    }
    positionals.push(tok);
    i += 1;
  }

  return { positionals, options: opts };
}

/**
 * Helper: pull a string option, throwing a friendly error if missing.
 */
export function requireString(
  args: ParsedArgs,
  key: string,
): string {
  const v = args.options[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`missing required --${key}`);
  }
  return v;
}

/** Helper: pull a string option or undefined. */
export function optionalString(
  args: ParsedArgs,
  key: string,
): string | undefined {
  const v = args.options[key];
  return typeof v === "string" ? v : undefined;
}

/** Helper: pull a boolean flag (default false). */
export function flag(args: ParsedArgs, key: string): boolean {
  const v = args.options[key];
  return v === true || v === "true" || v === "1";
}

/** Helper: pull an integer option, throwing on bad input. */
export function optionalInt(
  args: ParsedArgs,
  key: string,
): number | undefined {
  const v = args.options[key];
  if (v === undefined || typeof v === "boolean") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`--${key} must be an integer (got "${v}")`);
  }
  return n;
}

/** Helper: pull a comma-separated list of integers, e.g. `--dice 2,3,5`. */
export function optionalIntList(
  args: ParsedArgs,
  key: string,
): number[] | undefined {
  const v = args.options[key];
  if (v === undefined || typeof v === "boolean") return undefined;
  const parts = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return [];
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`--${key} entry "${p}" is not an integer`);
    }
    out.push(n);
  }
  return out;
}
