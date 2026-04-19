import { makeAutoObservable } from "mobx";

/**
 * Konami unlock detector for the web Almanac.
 *
 * Listens for the canonical sequence `↑ ↑ ↓ ↓ ← → ← → b a` on
 * `window.keydown`. Once unlocked:
 *   - A subtle ✦ glyph appears in the page footer (acts as a mode toggle).
 *   - All standard tabs gain "Æther mode" behaviour (wider dice/target
 *     ranges, arity 3/4/5, worker-backed live solving) when `mode` is
 *     `"aether"`.
 *
 * Held in MobX so React can react to the unlock without prop drilling.
 *
 * Two pieces of state worth distinguishing:
 *   - `unlocked` is *latched* — once flipped on by the Konami sequence
 *     it stays on for the session (currently in-memory only).
 *   - `mode` is the live preference that tabs key off. It defaults to
 *     `"aether"` once `unlocked` flips, but the user can manually
 *     toggle back to `"standard"` (e.g. to compare behaviours, or to
 *     dodge the heavier worker workloads on a slow machine).
 */
const KONAMI_KEYS: readonly string[] = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

export type SecretMode = "standard" | "aether";

export class SecretStore {
  unlocked = false;
  /**
   * Active mode. Always `"standard"` until `unlocked` is true; flips to
   * `"aether"` automatically the moment the Konami sequence completes.
   * The user can toggle back via the ✦ badge in the footer.
   */
  mode: SecretMode = "standard";
  /** Number of correct keys matched so far in the running sequence. */
  private cursor = 0;
  private detachListener: (() => void) | null = null;

  constructor() {
    makeAutoObservable<this, "cursor" | "detachListener">(this, {
      cursor: false,
      detachListener: false,
    });
  }

  /** Convenience accessor — `true` iff Æther features should render. */
  get aetherActive(): boolean {
    return this.unlocked && this.mode === "aether";
  }

  /** Toggle between standard and aether mode. No-op if locked. */
  toggleMode(): void {
    if (!this.unlocked) return;
    this.mode = this.mode === "aether" ? "standard" : "aether";
  }

  /** Force a specific mode. No-op if attempting to set aether while locked. */
  setMode(mode: SecretMode): void {
    if (mode === "aether" && !this.unlocked) return;
    this.mode = mode;
  }

  /**
   * Attach the global keydown listener. Returns a teardown function so
   * the React mount that called `attach` can clean up on unmount.
   */
  attach(): () => void {
    if (this.detachListener !== null) return this.detachListener;
    const handler = (e: KeyboardEvent): void => this.ingestKey(e.key);
    window.addEventListener("keydown", handler);
    this.detachListener = () => {
      window.removeEventListener("keydown", handler);
      this.detachListener = null;
    };
    return this.detachListener;
  }

  /** Test/utility hook: bypass the sequence. */
  forceUnlock(): void {
    this.unlocked = true;
    this.mode = "aether";
  }

  /** Exposed for tests. Mirrors the keydown handler logic. */
  ingestKey(key: string): void {
    if (this.unlocked) return;
    const expected = KONAMI_KEYS[this.cursor];
    if (expected === undefined) return;
    // Case-insensitive match for letter keys, exact match for arrows.
    const matches =
      expected.length === 1
        ? key.toLowerCase() === expected.toLowerCase()
        : key === expected;
    if (matches) {
      this.cursor += 1;
      if (this.cursor === KONAMI_KEYS.length) {
        this.unlocked = true;
        this.mode = "aether";
        this.cursor = 0;
      }
    } else {
      // Allow restart if the user re-enters the first key after a typo.
      this.cursor = key === KONAMI_KEYS[0] ? 1 : 0;
    }
  }
}
