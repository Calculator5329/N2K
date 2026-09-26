/**
 * URL-hash-backed UI state utility.
 *
 * The hash format is a flat `key=value` map separated by `&`, mirroring
 * the URL search string but living in `window.location.hash` so it stays
 * 100% client-side and never reaches the static host.
 *
 * Each value is opaque to this util — schemas own their own encoding,
 * including their own version prefix. That keeps the format stable when
 * one feature evolves without forcing every other feature to bump.
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
   * Encode the value to a hash-safe string. Implementations are free to
   * embed their own version tag (e.g. `"1:..."`) so they can evolve
   * independently of this util.
   */
  encode(value: T): string;
  /** Decode a raw string back to a value, or return `null` if invalid. */
  decode(raw: string): T | null;
}

/** `decodeURIComponent` that answers `null` instead of throwing on bad `%` escapes. */
export function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Parse a raw hash (with or without the leading `#`) into its `k=v`
 * pairs. Parts with malformed percent-escapes are skipped rather than
 * thrown, so a mangled pasted link can never crash boot.
 */
export function parseHashPairs(hash: string): Map<string, string> {
  const out = new Map<string, string>();
  const raw = hash.replace(/^#/, "");
  if (raw.length === 0) return out;
  for (const part of raw.split("&")) {
    if (part.length === 0) continue;
    const eq = part.indexOf("=");
    const k = safeDecode(eq < 0 ? part : part.slice(0, eq));
    const v = eq < 0 ? "" : safeDecode(part.slice(eq + 1));
    if (k === null || v === null) continue;
    out.set(k, v);
  }
  return out;
}

function readAllPairs(): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  return parseHashPairs(window.location.hash);
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
  // hashchange listeners still fire on programmatic hash assignment but
  // not on replaceState — we dispatch a synthetic event so subscribers
  // (e.g. cross-store mirrors) still see the change.
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
 * untouched. Pass `null` to remove the key.
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

/**
 * Subscribe to hash changes. Fires on `hashchange` (back/forward, manual
 * edits) but not on our own `replaceState` writes — that's intentional:
 * `replaceState` is what the local store just did, so it already has the
 * latest value.
 *
 * Returns an unsubscribe function.
 */
export function subscribeHash(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (): void => handler();
  window.addEventListener("hashchange", wrapped);
  return () => window.removeEventListener("hashchange", wrapped);
}
