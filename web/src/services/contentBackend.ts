/**
 * Content backend abstraction.
 *
 * Every persisted user-authored artifact (boards, competitions, custom
 * themes, custom modes, saved games, ...) is a {@link ContentEntity}
 * shuttled through this interface. The point of the abstraction is so
 * that today's `MemoryContentBackend` (and tomorrow's `IdbContentBackend`)
 * can be swapped out for `FirestoreContentBackend` later without any
 * feature code changing.
 *
 * Design rules:
 *   - Backends are stateless from the caller's perspective. They MAY
 *     cache internally, but every public method behaves as if it ran
 *     fresh.
 *   - Backends DO NOT own MobX. Stores own MobX; backends return plain
 *     promises and offer subscription callbacks.
 *   - All read methods return `null` for "not found" rather than
 *     throwing — "missing" is not exceptional.
 *   - `subscribe` is best-effort. Local backends can implement it with
 *     a real change feed (BroadcastChannel for IDB, in-memory listener
 *     bus for memory). Backends that genuinely can't observe changes
 *     should still return a `() => void` unsubscriber that's a no-op.
 */

// ---------------------------------------------------------------------------
//  Entity shape
// ---------------------------------------------------------------------------

/** Discriminator over the kinds of user-authored content the platform stores. */
export type ContentKind =
  | "board"
  | "competition"
  | "theme"
  | "mode"
  | "gameSession"
  | "moveLog";

/**
 * Envelope shared by every persisted artifact. The `body` is the
 * kind-specific payload — typed at the call site by the store that
 * owns this kind.
 */
export interface ContentEntity<TBody = unknown> {
  readonly id: string;
  readonly kind: ContentKind;
  readonly ownerId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Bumped on every `put`. Backends use this for last-write-wins. */
  readonly revision: number;
  /** Free-form tags for indexing; backends MAY index a subset. */
  readonly tags?: readonly string[];
  /** Human-meaningful title for list UIs. */
  readonly title?: string;
  /** Kind-specific payload. */
  readonly body: TBody;
}

// ---------------------------------------------------------------------------
//  Query
// ---------------------------------------------------------------------------

export interface ListQuery {
  readonly ownerId?: string;
  readonly tagsAny?: readonly string[];
  readonly tagsAll?: readonly string[];
  readonly limit?: number;
  /**
   * Field to sort by. Backends MUST support `"updatedAt"` and
   * `"createdAt"`; other fields are best-effort.
   */
  readonly sortBy?: "updatedAt" | "createdAt" | "title";
  readonly sortDir?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
//  Backend interface
// ---------------------------------------------------------------------------

/** Callback fired when an entity's stored state changes. `null` ⇒ deleted. */
export type ChangeListener<TBody = unknown> = (
  entity: ContentEntity<TBody> | null,
) => void;

export interface ContentBackend {
  /** Fetch a single entity by `(kind, id)`. Returns `null` if missing. */
  get<TBody = unknown>(
    kind: ContentKind,
    id: string,
  ): Promise<ContentEntity<TBody> | null>;

  /**
   * Insert or update. The backend assigns `revision = (existing?.revision ?? 0) + 1`
   * and `updatedAt = Date.now()`; the `revision`/`updatedAt` on the
   * input are ignored. `createdAt` is preserved across updates.
   */
  put<TBody = unknown>(entity: ContentEntity<TBody>): Promise<ContentEntity<TBody>>;

  /** Idempotent: deleting a missing entity is not an error. */
  delete(kind: ContentKind, id: string): Promise<void>;

  /** Best-effort listing. Implementations MUST honor `kind`. */
  list<TBody = unknown>(
    kind: ContentKind,
    query?: ListQuery,
  ): Promise<readonly ContentEntity<TBody>[]>;

  /**
   * Subscribe to changes for a specific entity. Returns an unsubscriber.
   * Callers MUST call the unsubscriber on teardown to avoid leaks.
   *
   * Backends that can't observe changes natively (e.g. read-only ones)
   * may return a no-op unsubscriber.
   */
  subscribe<TBody = unknown>(
    kind: ContentKind,
    id: string,
    listener: ChangeListener<TBody>,
  ): () => void;

  /**
   * Subscribe to ANY change in a kind. Useful for list UIs that need
   * to refresh on insert/delete.
   */
  subscribeKind<TBody = unknown>(
    kind: ContentKind,
    listener: ChangeListener<TBody>,
  ): () => void;
}
