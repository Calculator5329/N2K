/**
 * `BoardLibraryService` — persistence wrapper for user-saved Compose
 * boards.
 *
 * Sits on top of {@link ContentBackend} (kind `"board"`) so that today's
 * `MemoryContentBackend` can be swapped for `IdbContentBackend` and
 * eventually `FirestoreContentBackend` without touching any feature
 * code. The service deliberately stays thin — it owns no MobX, only
 * promises + a small change-feed callback — so {@link BoardLibraryStore}
 * (in `stores/`) can wrap it observably.
 *
 * A {@link BoardDoc} is a single named board recipe. The body mirrors
 * `ComposeStore.BoardConfig` minus the runtime `id`, so a saved board
 * can be re-instantiated into the editor losslessly. Pinned cells are
 * preserved as a sorted index list so the wire format stays stable
 * across IndexedDB / Firestore boundaries (a `Set` doesn't serialize).
 */
import type {
  ContentBackend,
  ContentEntity,
} from "./contentBackend.js";

/** Compose's two supported generation modes for a board. */
export type BoardKind = "random" | "pattern";

/** Range used by `random` boards. */
export interface BoardRandomParams {
  readonly min: number;
  readonly max: number;
}

/** Multiples + start used by `pattern` boards. */
export interface BoardPatternParams {
  readonly multiples: readonly number[];
  readonly start: number;
}

/** Persisted body of a single board recipe. */
export interface BoardDocBody {
  /** Compose mode this board was authored against (`standard` / `aether`). */
  readonly modeId: "standard" | "aether";
  readonly kind: BoardKind;
  readonly random: BoardRandomParams;
  readonly pattern: BoardPatternParams;
  readonly rounds: number;
  /** Frozen cells the user generated. */
  readonly cells: readonly number[];
  /** Indexes of cells the user pinned (preserved across regenerations). */
  readonly pinned: readonly number[];
}

/** Thin alias so callers don't have to repeat the body type. */
export type BoardDoc = ContentEntity<BoardDocBody>;

/** Inputs for creating / updating a board. The service fills in the rest. */
export interface SaveBoardInput {
  /** Stable id. Pass `undefined` to mint a fresh id. */
  readonly id?: string;
  readonly title: string;
  readonly ownerId: string;
  readonly tags?: readonly string[];
  readonly body: BoardDocBody;
}

export interface BoardLibraryService {
  /** List every saved board, newest-first by default. */
  list(query?: { readonly ownerId?: string; readonly limit?: number }): Promise<readonly BoardDoc[]>;
  /** Fetch one. `null` if missing. */
  get(id: string): Promise<BoardDoc | null>;
  /** Create or update. Returns the persisted doc with bumped revision. */
  save(input: SaveBoardInput): Promise<BoardDoc>;
  /** Idempotent. */
  remove(id: string): Promise<void>;
  /** Subscribe to any insert/update/delete in the library. */
  subscribe(listener: (changed: BoardDoc | null) => void): () => void;
}

/**
 * Default implementation backed by any {@link ContentBackend}. The
 * mapping is 1:1 — `kind = "board"`, no schema migration logic yet
 * (that lands when we ship a v2 body shape).
 */
export class ContentBackendBoardLibrary implements BoardLibraryService {
  constructor(private readonly content: ContentBackend) {}

  async list(query: { readonly ownerId?: string; readonly limit?: number } = {}): Promise<readonly BoardDoc[]> {
    return this.content.list<BoardDocBody>("board", {
      ...(query.ownerId !== undefined ? { ownerId: query.ownerId } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      sortBy: "updatedAt",
      sortDir: "desc",
    });
  }

  async get(id: string): Promise<BoardDoc | null> {
    return this.content.get<BoardDocBody>("board", id);
  }

  async save(input: SaveBoardInput): Promise<BoardDoc> {
    const id = input.id ?? mintBoardId();
    const now = Date.now();
    const entity: BoardDoc = {
      id,
      kind: "board",
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      title: input.title,
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      body: input.body,
    };
    return this.content.put<BoardDocBody>(entity);
  }

  async remove(id: string): Promise<void> {
    await this.content.delete("board", id);
  }

  subscribe(listener: (changed: BoardDoc | null) => void): () => void {
    return this.content.subscribeKind<BoardDocBody>("board", listener);
  }
}

let boardIdSeq = 0;

/**
 * Mint a sortable, collision-resistant board id. Format:
 *   `board-<base36-now>-<base36-counter>`
 * The counter guarantees uniqueness when several saves happen inside
 * the same millisecond (test runs, rapid clicks).
 */
export function mintBoardId(): string {
  boardIdSeq = (boardIdSeq + 1) % Number.MAX_SAFE_INTEGER;
  return `board-${Date.now().toString(36)}-${boardIdSeq.toString(36)}`;
}
