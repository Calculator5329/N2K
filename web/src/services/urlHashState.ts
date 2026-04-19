/**
 * URL-hash-backed UI state utility.
 *
 * The hash format is a flat `key=value` map separated by `&`, mirroring
 * the URL search string but living in `window.location.hash` so it
 * stays 100% client-side and never reaches the static host.
 *
 * Each value is opaque to this util — schemas own their own encoding,
 * including their own version prefix. That keeps the format stable
 * when one feature evolves without forcing every other feature to
 * bump.
 *
 * Unknown keys are preserved on every write so multiple features can
 * share the hash without stomping on each other.
 */

/**
 * Schema for one logical piece of state stored in the URL hash. Each
 * feature defines its own; the util just parses the `k=v&k=v` envelope.
 */
export interface HashSchema<T> {
  /**
   * Encode the value to a hash-safe string. Implementations are free
   * to embed their own version tag (e.g. `"1:..."`) so they can
   * evolve independently of this util.
   */
  encode(value: T): string;
  /** Decode a raw string back to a value, or return `null` if invalid. */
  decode(raw: string): T | null;
}

function readAllPairs(): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof window === "undefined") return out;
  const raw = window.location.hash.replace(/^#/, "");
  if (raw.length === 0) return out;
  for (const part of raw.split("&")) {
    if (part.length === 0) continue;
    const eq = part.indexOf("=");
    if (eq < 0) {
      out.set(decodeURIComponent(part), "");
      continue;
    }
    const k = decodeURIComponent(part.slice(0, eq));
    const v = decodeURIComponent(part.slice(eq + 1));
    out.set(k, v);
  }
  return out;
}

function writeAllPairs(pairs: Map<string, string>): void {
  if (typeof window === "undefined") return;
  const parts: string[] = [];
  for (const [k, v] of pairs) {
    if (v.length === 0) {
      parts.push(encodeURIComponent(k));
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  const next = parts.join("&");
  const current = window.location.hash.replace(/^#/, "");
  if (next === current) return;
  // Use replaceState so changing UI state never pollutes the back stack.
  // hashchange listeners do not fire on programmatic replaceState — we
  // dispatch a synthetic event so subscribers (cross-store mirrors)
  // still see the change.
  const url = `${window.location.pathname}${window.location.search}${next.length > 0 ? `#${next}` : ""}`;
  window.history.replaceState(window.history.state, "", url);
}

/** Read a single typed value from the hash. Returns `null` if absent or invalid. */
export function readHash<T>(key: string, schema: HashSchema<T>): T | null {
  const raw = readAllPairs().get(key);
  if (raw === undefined) return null;
  return schema.decode(raw);
}

/**
 * Write a single typed value to the hash, leaving every other key
 * untouched. Pass `null` (or use `clearHash`) to remove the key.
 */
export function writeHash<T>(key: string, value: T | null, schema: HashSchema<T>): void {
  const pairs = readAllPairs();
  if (value === null) {
    if (!pairs.has(key)) return;
    pairs.delete(key);
  } else {
    pairs.set(key, schema.encode(value));
  }
  writeAllPairs(pairs);
}

/** Remove a single key from the hash without touching the others. */
export function clearHash(key: string): void {
  const pairs = readAllPairs();
  if (!pairs.has(key)) return;
  pairs.delete(key);
  writeAllPairs(pairs);
}

/**
 * Subscribe to hash changes. Fires on the browser's `hashchange`
 * event (back / forward / manual edits) but not on our own
 * `replaceState` writes.
 *
 * Returns an unsubscribe function.
 */
export function subscribeHash(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (): void => handler();
  window.addEventListener("hashchange", wrapped);
  return () => window.removeEventListener("hashchange", wrapped);
}
