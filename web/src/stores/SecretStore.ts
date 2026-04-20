/**
 * `SecretStore` — Konami unlock + Æther mode latch.
 *
 * Konami sequence: `↑ ↑ ↓ ↓ ← → ← → b a`. Once unlocked:
 *   - `unlocked` latches `true` for the rest of the session.
 *   - `mode` flips to `"aether"` automatically.
 *   - `aetherActive` becomes the live "should Æther features render?"
 *     boolean every UI gate keys off.
 *
 * The window listener is attached from `App.tsx` so SSR / test
 * environments without a `window` object can construct the store
 * without side effects.
 */
import { makeAutoObservable } from "mobx";

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
   * The user can toggle back via the floating ✦ badge.
   */
  mode: SecretMode = "standard";
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
   * Idempotent: re-calling without detaching first returns the existing
   * teardown so we never double-bind.
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
      this.cursor = key === KONAMI_KEYS[0] ? 1 : 0;
    }
  }
}
