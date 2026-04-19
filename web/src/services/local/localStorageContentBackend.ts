/**
 * `LocalStorageContentBackend` — drop-in `ContentBackend` that persists
 * to `window.localStorage`.
 *
 * Sits between `MemoryContentBackend` (test-only) and the eventual
 * `IdbContentBackend` / `FirestoreContentBackend`. Good enough for the
 * Phase 6 saved-boards starter where:
 *   - we don't need cross-tab change events (a `storage` event hook
 *     would be a nice add but is non-blocking for the MVP);
 *   - per-record sizes are <50 KB (BoardDoc bodies are tiny);
 *   - in-process subscribers must still fire on local mutations so the
 *     observable wrappers stay in sync.
 *
 * Wire format: each entity is stored under
 *   `n2k.content.v1.{kind}.{id}` → JSON-serialized `ContentEntity`.
 *
 * Per-kind index keyed under
 *   `n2k.content.v1.index.{kind}` → JSON array of ids
 *
 * The index lets `list()` enumerate without scanning the whole
 * `localStorage` keyspace (which would scale poorly once the user has
 * many saved themes / competitions / sessions). Index reads tolerate
 * missing entities (the underlying record may have been hand-deleted)
 * by skipping them silently.
 *
 * Backends are required to be safe to instantiate in non-browser
 * contexts (vitest jsdom, SSR snapshots). The `safeStorage` shim
 * detects an unavailable `localStorage` and falls back to an in-memory
 * Map so calls don't throw — the resulting backend just behaves like
 * `MemoryContentBackend` in those environments.
 */
import type {
  ChangeListener,
  ContentBackend,
  ContentEntity,
  ContentKind,
  ListQuery,
} from "../contentBackend.js";

const KEY_PREFIX = "n2k.content.v1";
const INDEX_PREFIX = `${KEY_PREFIX}.index`;
const ENTITY_PREFIX = `${KEY_PREFIX}.entity`;

interface KindListeners {
  readonly perEntity: Map<string, Set<ChangeListener<unknown>>>;
  readonly kindWide: Set<ChangeListener<unknown>>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeStorage(): StorageLike {
  try {
    if (typeof window !== "undefined" && window.localStorage !== undefined) {
      // Probe — Safari private mode allows the API but throws on write.
      const probe = `${KEY_PREFIX}.__probe`;
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // fall through to in-memory shim
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: (k) => {
      mem.delete(k);
    },
  };
}

export class LocalStorageContentBackend implements ContentBackend {
  private readonly storage: StorageLike;
  private readonly listeners = new Map<ContentKind, KindListeners>();

  constructor(storage?: StorageLike) {
    this.storage = storage ?? safeStorage();
  }

  async get<TBody = unknown>(
    kind: ContentKind,
    id: string,
  ): Promise<ContentEntity<TBody> | null> {
    const raw = this.storage.getItem(entityKey(kind, id));
    if (raw === null) return null;
    return parseEntity<TBody>(raw);
  }

  async put<TBody = unknown>(
    entity: ContentEntity<TBody>,
  ): Promise<ContentEntity<TBody>> {
    const existingRaw = this.storage.getItem(entityKey(entity.kind, entity.id));
    const existing = existingRaw === null ? null : parseEntity<TBody>(existingRaw);
    const now = Date.now();
    const merged: ContentEntity<TBody> = {
      ...entity,
      createdAt: existing?.createdAt ?? entity.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
    };
    this.storage.setItem(entityKey(entity.kind, entity.id), JSON.stringify(merged));
    if (existing === null) {
      this.appendIndex(entity.kind, entity.id);
    }
    this.notify(entity.kind, entity.id, merged as ContentEntity<unknown>);
    return merged;
  }

  async delete(kind: ContentKind, id: string): Promise<void> {
    const key = entityKey(kind, id);
    if (this.storage.getItem(key) === null) return;
    this.storage.removeItem(key);
    this.removeFromIndex(kind, id);
    this.notify(kind, id, null);
  }

  async list<TBody = unknown>(
    kind: ContentKind,
    query: ListQuery = {},
  ): Promise<readonly ContentEntity<TBody>[]> {
    const ids = this.readIndex(kind);
    const all: ContentEntity<TBody>[] = [];
    for (const id of ids) {
      const raw = this.storage.getItem(entityKey(kind, id));
      if (raw === null) continue;
      const parsed = parseEntity<TBody>(raw);
      if (parsed !== null) all.push(parsed);
    }

    let filtered = all;
    if (query.ownerId !== undefined) {
      filtered = filtered.filter((e) => e.ownerId === query.ownerId);
    }
    if (query.tagsAny !== undefined && query.tagsAny.length > 0) {
      const want = new Set(query.tagsAny);
      filtered = filtered.filter((e) => (e.tags ?? []).some((t) => want.has(t)));
    }
    if (query.tagsAll !== undefined && query.tagsAll.length > 0) {
      const want = new Set(query.tagsAll);
      filtered = filtered.filter((e) => {
        const have = new Set(e.tags ?? []);
        for (const t of want) if (!have.has(t)) return false;
        return true;
      });
    }

    const sortBy = query.sortBy ?? "updatedAt";
    const dir = (query.sortDir ?? "desc") === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortBy];
      const bv = (b as unknown as Record<string, unknown>)[sortBy];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });

    if (query.limit !== undefined) filtered = filtered.slice(0, query.limit);
    return filtered;
  }

  subscribe<TBody = unknown>(
    kind: ContentKind,
    id: string,
    listener: ChangeListener<TBody>,
  ): () => void {
    const k = this.listenersFor(kind);
    let perEntity = k.perEntity.get(id);
    if (perEntity === undefined) {
      perEntity = new Set();
      k.perEntity.set(id, perEntity);
    }
    perEntity.add(listener as ChangeListener<unknown>);
    return () => {
      const set = k.perEntity.get(id);
      if (set === undefined) return;
      set.delete(listener as ChangeListener<unknown>);
      if (set.size === 0) k.perEntity.delete(id);
    };
  }

  subscribeKind<TBody = unknown>(
    kind: ContentKind,
    listener: ChangeListener<TBody>,
  ): () => void {
    const k = this.listenersFor(kind);
    k.kindWide.add(listener as ChangeListener<unknown>);
    return () => {
      k.kindWide.delete(listener as ChangeListener<unknown>);
    };
  }

  // ---------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------

  private listenersFor(kind: ContentKind): KindListeners {
    let l = this.listeners.get(kind);
    if (l === undefined) {
      l = { perEntity: new Map(), kindWide: new Set() };
      this.listeners.set(kind, l);
    }
    return l;
  }

  private notify(
    kind: ContentKind,
    id: string,
    entity: ContentEntity<unknown> | null,
  ): void {
    const l = this.listeners.get(kind);
    if (l === undefined) return;
    const perEntity = l.perEntity.get(id);
    if (perEntity !== undefined) for (const fn of perEntity) fn(entity);
    for (const fn of l.kindWide) fn(entity);
  }

  private readIndex(kind: ContentKind): readonly string[] {
    const raw = this.storage.getItem(indexKey(kind));
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x): x is string => typeof x === "string");
    } catch {
      return [];
    }
  }

  private writeIndex(kind: ContentKind, ids: readonly string[]): void {
    this.storage.setItem(indexKey(kind), JSON.stringify(ids));
  }

  private appendIndex(kind: ContentKind, id: string): void {
    const ids = this.readIndex(kind);
    if (ids.includes(id)) return;
    this.writeIndex(kind, [...ids, id]);
  }

  private removeFromIndex(kind: ContentKind, id: string): void {
    const ids = this.readIndex(kind);
    const filtered = ids.filter((x) => x !== id);
    if (filtered.length === ids.length) return;
    this.writeIndex(kind, filtered);
  }
}

function entityKey(kind: ContentKind, id: string): string {
  return `${ENTITY_PREFIX}.${kind}.${id}`;
}

function indexKey(kind: ContentKind): string {
  return `${INDEX_PREFIX}.${kind}`;
}

function parseEntity<TBody>(raw: string): ContentEntity<TBody> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as ContentEntity<TBody>;
  } catch {
    return null;
  }
}
