/**
 * `ContentBackend` — abstract persistence interface for user-authored
 * documents (currently just `CompetitionDoc`). The web app ships with a
 * single concrete implementation (`LocalStorageContentBackend`) so a
 * page reload doesn't lose in-progress work, but the interface is
 * intentionally narrow so a future Firestore / IndexedDB / cloud
 * backend can drop in without touching call sites.
 *
 * Design notes:
 *   - Documents are addressed by an opaque string `id`. Backends MUST
 *     treat ids as filesystem-safe (slashes are forbidden by callers).
 *   - All methods are async to leave room for network-backed
 *     implementations even though `LocalStorage` is sync.
 *   - Errors propagate via rejected promises; no silent fallbacks.
 *     Stores decide how to render failure (toast, banner, etc.).
 */

export interface ContentDoc<TBody = unknown> {
  /** Stable id (caller assigns, backend just stores). */
  readonly id: string;
  /** Doc body. Backend serializes via `JSON.stringify`. */
  readonly body: TBody;
  /** ISO timestamp; backend rewrites on every `save`. */
  readonly updatedAt: string;
  /** Version tag for migrations; bump when `body` shape changes. */
  readonly schemaVersion: number;
}

export interface ContentBackend {
  load<TBody>(id: string): Promise<ContentDoc<TBody> | null>;
  save<TBody>(doc: ContentDoc<TBody>): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<readonly string[]>;
}

/**
 * Browser-side `localStorage` backend. Keys are namespaced under a
 * single prefix so we don't fight the rest of the app for storage real
 * estate (themes, secret-store latch, etc. all live next to us).
 */
const LS_PREFIX = "n2k:content:";

export class LocalStorageContentBackend implements ContentBackend {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  async load<TBody>(id: string): Promise<ContentDoc<TBody> | null> {
    if (this.storage === undefined) return null;
    const raw = this.storage.getItem(LS_PREFIX + id);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as ContentDoc<TBody>;
    } catch {
      return null;
    }
  }

  async save<TBody>(doc: ContentDoc<TBody>): Promise<void> {
    if (this.storage === undefined) return;
    this.storage.setItem(LS_PREFIX + doc.id, JSON.stringify(doc));
  }

  async remove(id: string): Promise<void> {
    if (this.storage === undefined) return;
    this.storage.removeItem(LS_PREFIX + id);
  }

  async list(): Promise<readonly string[]> {
    if (this.storage === undefined) return [];
    const ids: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key !== null && key.startsWith(LS_PREFIX)) {
        ids.push(key.slice(LS_PREFIX.length));
      }
    }
    return ids;
  }
}

/** Default singleton — safe to import from any layer. */
export const defaultContentBackend: ContentBackend =
  typeof globalThis.localStorage === "undefined"
    ? new LocalStorageContentBackend({
        // SSR / test fallback: swallow writes silently.
        length: 0,
        clear() {},
        getItem: () => null,
        key: () => null,
        removeItem() {},
        setItem() {},
      } as Storage)
    : new LocalStorageContentBackend();
