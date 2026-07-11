/**
 * `OnboardingStore` — first-run welcome latch.
 *
 * A stranger landing on the site has no idea what N2K is: the default
 * surface is Lookup ("pick dice, find an equation"), which reads like a
 * calculator, not a game. This store gates a one-time welcome overlay
 * (see {@link WelcomeOverlay}) that explains the game in a sentence and
 * offers a single-click "Play a Quick Race" on-ramp.
 *
 * "Shown once" is the whole point: the overlay opens on the very first
 * visit, and dismissing it (or starting a race from it) writes a flag
 * to localStorage so a returning player is never nagged again. The flag
 * is a standalone key with no schema — nothing to migrate.
 *
 * Storage is injected (mirroring {@link DailyChallengeStore}) so tests
 * can drive the latch without a real `window`. In private-browsing /
 * blocked-storage situations both reads and writes are wrapped in
 * try/catch: we would rather show the welcome once too often than crash
 * on boot.
 */
import { makeAutoObservable } from "mobx";

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "n2k.onboarded.v1";

const memoryStorage = (): OnboardingStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

function browserStorage(): OnboardingStorage {
  return typeof window === "undefined" ? memoryStorage() : window.localStorage;
}

/** Web-facing lifecycle for the first-run welcome overlay. */
export class OnboardingStore {
  /** Whether the welcome overlay should currently be visible. */
  open: boolean;

  constructor(private readonly storage: OnboardingStorage = browserStorage()) {
    let seen = false;
    try {
      seen = this.storage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Blocked / unavailable storage — treat as a first run. The
      // dismiss write below will also no-op, so we simply won't persist.
      seen = false;
    }
    this.open = !seen;
    makeAutoObservable<this, "storage">(this, { storage: false });
  }

  /**
   * Mark onboarding as seen and close the overlay. Idempotent — safe to
   * call from both the "Play a Quick Race" CTA and the dismiss control.
   */
  dismiss(): void {
    this.open = false;
    try {
      this.storage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures; the in-memory flag still closes it for
      // this session.
    }
  }
}
