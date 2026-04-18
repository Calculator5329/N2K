/**
 * In-memory `ContentBackend` for tests and bootstrap.
 *
 * Supports the full interface — get/put/delete/list/subscribe — entirely
 * in process. Use this in tests and as the temporary default until
 * `IdbContentBackend` (IndexedDB) lands. Drop-in compatible: the eventual
 * Firestore impl follows the same contract.
 */
import type {
  ChangeListener,
  ContentBackend,
  ContentEntity,
  ContentKind,
  ListQuery,
} from "../contentBackend.js";

interface KindStore {
  readonly entities: Map<string, ContentEntity<unknown>>;
  readonly perEntityListeners: Map<string, Set<ChangeListener<unknown>>>;
  readonly kindListeners: Set<ChangeListener<unknown>>;
}

export class MemoryContentBackend implements ContentBackend {
  private readonly stores = new Map<ContentKind, KindStore>();

  private storeFor(kind: ContentKind): KindStore {
    let s = this.stores.get(kind);
    if (s === undefined) {
      s = {
        entities: new Map(),
        perEntityListeners: new Map(),
        kindListeners: new Set(),
      };
      this.stores.set(kind, s);
    }
    return s;
  }

  async get<TBody = unknown>(
    kind: ContentKind,
    id: string,
  ): Promise<ContentEntity<TBody> | null> {
    const s = this.storeFor(kind);
    return (s.entities.get(id) as ContentEntity<TBody> | undefined) ?? null;
  }

  async put<TBody = unknown>(
    entity: ContentEntity<TBody>,
  ): Promise<ContentEntity<TBody>> {
    const s = this.storeFor(entity.kind);
    const existing = s.entities.get(entity.id);
    const now = Date.now();
    const merged: ContentEntity<TBody> = {
      ...entity,
      createdAt: existing?.createdAt ?? entity.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
    };
    s.entities.set(entity.id, merged as ContentEntity<unknown>);
    this.notify(s, entity.id, merged as ContentEntity<unknown>);
    return merged;
  }

  async delete(kind: ContentKind, id: string): Promise<void> {
    const s = this.storeFor(kind);
    if (!s.entities.has(id)) return;
    s.entities.delete(id);
    this.notify(s, id, null);
  }

  async list<TBody = unknown>(
    kind: ContentKind,
    query: ListQuery = {},
  ): Promise<readonly ContentEntity<TBody>[]> {
    const s = this.storeFor(kind);
    let entities = [...s.entities.values()] as ContentEntity<TBody>[];

    if (query.ownerId !== undefined) {
      entities = entities.filter((e) => e.ownerId === query.ownerId);
    }
    if (query.tagsAny !== undefined && query.tagsAny.length > 0) {
      const want = new Set(query.tagsAny);
      entities = entities.filter((e) => (e.tags ?? []).some((t) => want.has(t)));
    }
    if (query.tagsAll !== undefined && query.tagsAll.length > 0) {
      const want = new Set(query.tagsAll);
      entities = entities.filter((e) => {
        const have = new Set(e.tags ?? []);
        for (const t of want) if (!have.has(t)) return false;
        return true;
      });
    }

    const sortBy = query.sortBy ?? "updatedAt";
    const sortDir = query.sortDir ?? "desc";
    const dir = sortDir === "asc" ? 1 : -1;
    entities.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortBy];
      const bv = (b as unknown as Record<string, unknown>)[sortBy];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });

    if (query.limit !== undefined) entities = entities.slice(0, query.limit);
    return entities;
  }

  subscribe<TBody = unknown>(
    kind: ContentKind,
    id: string,
    listener: ChangeListener<TBody>,
  ): () => void {
    const s = this.storeFor(kind);
    let listeners = s.perEntityListeners.get(id);
    if (listeners === undefined) {
      listeners = new Set();
      s.perEntityListeners.set(id, listeners);
    }
    listeners.add(listener as ChangeListener<unknown>);
    return () => {
      const set = s.perEntityListeners.get(id);
      if (set === undefined) return;
      set.delete(listener as ChangeListener<unknown>);
      if (set.size === 0) s.perEntityListeners.delete(id);
    };
  }

  subscribeKind<TBody = unknown>(
    kind: ContentKind,
    listener: ChangeListener<TBody>,
  ): () => void {
    const s = this.storeFor(kind);
    s.kindListeners.add(listener as ChangeListener<unknown>);
    return () => {
      s.kindListeners.delete(listener as ChangeListener<unknown>);
    };
  }

  private notify(
    s: KindStore,
    id: string,
    entity: ContentEntity<unknown> | null,
  ): void {
    const perEntity = s.perEntityListeners.get(id);
    if (perEntity !== undefined) {
      for (const listener of perEntity) listener(entity);
    }
    for (const listener of s.kindListeners) listener(entity);
  }
}
