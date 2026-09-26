/**
 * Top-level view <-> URL hash, so reload, Back/Forward and pasted links
 * all land on the right surface.
 *
 * Non-Lookup views add a `view=<slug>` pair to the shared `k=v&k=v` hash
 * (see `services/urlHashState`). Slugs are the tab names
 * (`competition`, `library`, `play`). Lookup is the default and carries
 * no `view` pair, so every Lookup link ever shared (`#lookup=1:2,3,5/10`)
 * keeps its exact format and meaning.
 */
import { decodeShareable } from "../services/compressedHashCodec.js";
import { parseHashPairs, safeDecode } from "../services/urlHashState.js";
import type { View } from "./types.js";

const VIEW_KEY = "view";

/** Slug each view writes into the hash. */
const SLUG: Record<View, string> = {
  lookup: "lookup",
  compose: "competition",
  library: "library",
  play: "play",
};

/** Slugs accepted on read: every emitted slug plus the internal id `compose`. */
const FROM_SLUG: ReadonlyMap<string, View> = new Map<string, View>([
  ["lookup", "lookup"],
  ["competition", "compose"],
  ["compose", "compose"],
  ["library", "library"],
  ["play", "play"],
]);

/**
 * Share payloads and the view that consumes them. Leaving that view drops
 * the payload, so a stale `plan=` cannot drag a later reload back into
 * Competition or overwrite the recipient's draft from another view.
 */
const PAYLOAD_OWNER: ReadonlyMap<string, View> = new Map<string, View>([
  ["plan", "compose"],
  ["race", "play"],
]);

/**
 * True when the hash carries a `race=` or `plan=` payload that decodes
 * with the same codec the share loaders use. An empty or garbage payload
 * is false, so it cannot suppress first-run onboarding for nothing.
 */
export async function sharePayloadDecodes(hash: string): Promise<boolean> {
  const pairs = parseHashPairs(hash);
  for (const key of PAYLOAD_OWNER.keys()) {
    const raw = pairs.get(key);
    if (raw !== undefined && raw.length > 0 && (await decodeShareable<unknown>(raw)) !== null) {
      return true;
    }
  }
  return false;
}

/**
 * Which view a hash opens. An explicit `view=` wins; otherwise older
 * share links infer it from their payload key (`race=` opens Play,
 * `plan=` opens Competition). Anything else, including junk, is Lookup.
 */
export function viewFromHash(hash: string): View {
  const pairs = parseHashPairs(hash);
  const explicit = FROM_SLUG.get(pairs.get(VIEW_KEY) ?? "");
  if (explicit !== undefined) return explicit;
  if (pairs.has("race")) return "play";
  if (pairs.has("plan")) return "compose";
  return "lookup";
}

/**
 * The raw hash (no `#`) for showing `view`. Other pairs are kept
 * byte-for-byte, except share payloads owned by a different view. The
 * `view` pair goes first so the URL reads `#view=library&lookup=...`;
 * Lookup drops it entirely.
 */
export function hashForView(hash: string, view: View): string {
  const rest = hash
    .replace(/^#/, "")
    .split("&")
    .filter((part) => {
      if (part.length === 0) return false;
      const eq = part.indexOf("=");
      const key = safeDecode(eq < 0 ? part : part.slice(0, eq));
      if (key === VIEW_KEY) return false;
      const owner = key === null ? undefined : PAYLOAD_OWNER.get(key);
      return owner === undefined || owner === view;
    });
  if (view !== "lookup") rest.unshift(`${VIEW_KEY}=${SLUG[view]}`);
  return rest.join("&");
}
