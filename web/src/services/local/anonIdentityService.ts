/**
 * Anonymous-identity provider backed by `localStorage`.
 *
 * Generates a stable per-browser id on first call and reuses it across
 * sessions. The display name is randomly drawn from a small adjective +
 * noun pool so the user has a memorable handle without any sign-in
 * friction.
 *
 * When `localStorage` is unavailable (private mode, Node test runner
 * without happy-dom, etc.) the service falls back to an in-memory id
 * that lasts only for the current process.
 */
import type { IdentityService, User } from "../identityService.js";

const STORAGE_KEY = "n2k.anonUser.v1";

const ADJECTIVES = [
  "Lucky", "Crimson", "Quiet", "Stellar", "Brisk", "Verdant", "Ember",
  "Tidal", "Iron", "Glimmering", "Hidden", "Wandering",
] as const;
const NOUNS = [
  "Solver", "Magus", "Gambit", "Cipher", "Beacon", "Nomad", "Glyph",
  "Fox", "Owl", "Sage", "Tinker", "Architect",
] as const;

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randomDisplayName(rng: () => number = Math.random): string {
  return `${pick(ADJECTIVES, rng)} ${pick(NOUNS, rng)}`;
}

function randomId(): string {
  // 12 bytes of base36 — no crypto strength needed; this is a local handle.
  return Array.from(
    { length: 12 },
    () => Math.floor(Math.random() * 36).toString(36),
  ).join("");
}

interface PersistedShape {
  readonly id: string;
  readonly displayName: string;
  readonly anonymous: true;
}

function safeRead(): PersistedShape | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (typeof parsed.id !== "string" || typeof parsed.displayName !== "string") {
      return null;
    }
    return { id: parsed.id, displayName: parsed.displayName, anonymous: true };
  } catch {
    return null;
  }
}

function safeWrite(payload: PersistedShape): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full or disabled — accept the loss for an anonymous identity */
  }
}

export class AnonIdentityService implements IdentityService {
  private user: User;
  private readonly listeners = new Set<(u: User) => void>();

  constructor() {
    const stored = safeRead();
    if (stored !== null) {
      this.user = stored;
    } else {
      const fresh: PersistedShape = {
        id: randomId(),
        displayName: randomDisplayName(),
        anonymous: true,
      };
      safeWrite(fresh);
      this.user = fresh;
    }
  }

  currentUser(): User {
    return this.user;
  }

  onChange(listener: (u: User) => void): () => void {
    this.listeners.add(listener);
    listener(this.user);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test-only hook: reset to a fresh anonymous identity. */
  resetForTesting(): void {
    const fresh: PersistedShape = {
      id: randomId(),
      displayName: randomDisplayName(),
      anonymous: true,
    };
    safeWrite(fresh);
    this.user = fresh;
    for (const l of this.listeners) l(this.user);
  }

  /**
   * Test-only hook: rename the current user. Lets store tests that
   * assert "displayName flows through" change the identity without
   * resetting the id.
   */
  renameForTesting(displayName: string): void {
    this.user = { ...this.user, displayName };
    safeWrite({ id: this.user.id, displayName, anonymous: true });
    for (const l of this.listeners) l(this.user);
  }
}
