/**
 * Identity service abstraction.
 *
 * Every authenticated action eventually carries a `User`. Today the
 * default impl is `AnonIdentityService` — it generates a stable
 * per-browser anonymous id and stores it in `localStorage`. Tomorrow's
 * `FirebaseIdentityService` lets users actually sign in for cross-
 * device sync and multiplayer attribution.
 *
 * The interface intentionally exposes synchronous `currentUser()` so
 * stores can read it without `await`. Subscriptions surface async
 * changes (sign-in, sign-out, token refresh).
 */

export interface User {
  readonly id: string;
  readonly displayName: string;
  /** True when the id is a one-shot anonymous handle (no real account). */
  readonly anonymous: boolean;
  /** Optional avatar URL for the future profile UI. */
  readonly avatarUrl?: string;
}

export interface IdentityService {
  /** Synchronous accessor — always returns a valid `User`, never null. */
  currentUser(): User;

  /**
   * Subscribe to identity changes. Fires once with the current user
   * immediately on attach, then again on every change. Returns an
   * unsubscriber.
   */
  onChange(listener: (user: User) => void): () => void;

  /** Optional sign-in flow. May open a popup / redirect. */
  signIn?(): Promise<User>;

  /** Optional sign-out flow. */
  signOut?(): Promise<void>;
}
