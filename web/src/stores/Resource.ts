/**
 * `Resource<T>` — a MobX-observable wrapper over an async fetch.
 *
 * The whole point of this class is to make every observation site
 * trigger reactivity correctly without the v1 `cacheTick++` workaround.
 * The trick: `state` is a single observable union. Components that read
 * `resource.state` (or `resource.data`) re-render when ANY of
 * idle → loading → ready → error transitions happen.
 *
 * Usage:
 *
 * ```ts
 * class FooStore {
 *   readonly foo = new Resource<Foo>(() => api.fetchFoo());
 *
 *   constructor() { makeAutoObservable(this); this.foo.refresh(); }
 *
 *   get isReady() { return this.foo.state.kind === "ready"; }
 *   get foo() { return this.foo.data; }
 * }
 * ```
 *
 * Reactivity contract:
 *   - Reading `state`, `data`, `error`, `isLoading`, `isReady` from
 *     inside an observer/computed/autorun establishes a dependency
 *     on the resource.
 *   - Calling `refresh()` is a MobX action — multiple synchronous
 *     reads after it are batched.
 *   - In-flight `refresh()` calls supersede each other: only the
 *     latest fetcher's result is committed (via a stale-token guard).
 */
import { action, computed, makeObservable, observable, runInAction } from "mobx";

export type ResourceState<T> =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly previous: T | undefined }
  | { readonly kind: "ready"; readonly value: T }
  | { readonly kind: "error"; readonly error: unknown; readonly previous: T | undefined };

export interface ResourceOptions {
  /** If provided, refresh() is debounced by this many ms. */
  readonly debounceMs?: number;
}

export class Resource<T> {
  private _state: ResourceState<T> = { kind: "idle" };
  private fetcher: () => Promise<T>;
  private readonly opts: ResourceOptions;
  private inflightToken = 0;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(fetcher: () => Promise<T>, opts: ResourceOptions = {}) {
    this.fetcher = fetcher;
    this.opts = opts;
    makeObservable<this, "_state" | "commit">(this, {
      _state: observable.ref,
      state: computed,
      data: computed,
      error: computed,
      isLoading: computed,
      isReady: computed,
      refresh: action,
      reset: action,
      commit: action,
      setFetcher: action,
    });
  }

  get state(): ResourceState<T> {
    return this._state;
  }

  /** Convenience: latest known good value (during loading or ready). */
  get data(): T | undefined {
    switch (this._state.kind) {
      case "ready":
        return this._state.value;
      case "loading":
      case "error":
        return this._state.previous;
      case "idle":
        return undefined;
    }
  }

  get error(): unknown | undefined {
    return this._state.kind === "error" ? this._state.error : undefined;
  }

  get isLoading(): boolean {
    return this._state.kind === "loading";
  }

  get isReady(): boolean {
    return this._state.kind === "ready";
  }

  /**
   * Swap out the fetcher (for stores whose query parameters change).
   * Does NOT trigger a refresh — call `refresh()` after.
   */
  setFetcher(fetcher: () => Promise<T>): void {
    this.fetcher = fetcher;
  }

  /** Kick a fetch. Returns a promise that resolves once the state settles. */
  refresh(): Promise<void> {
    if (this.opts.debounceMs !== undefined && this.opts.debounceMs > 0) {
      if (this.debounceHandle !== null) clearTimeout(this.debounceHandle);
      return new Promise<void>((resolve) => {
        this.debounceHandle = setTimeout(() => {
          this.debounceHandle = null;
          this.doRefresh().then(resolve);
        }, this.opts.debounceMs);
      });
    }
    return this.doRefresh();
  }

  private async doRefresh(): Promise<void> {
    const token = ++this.inflightToken;
    const previous = this.data;
    runInAction(() => {
      this._state = { kind: "loading", previous };
    });
    try {
      const value = await this.fetcher();
      if (token !== this.inflightToken) return; // superseded
      this.commit({ kind: "ready", value });
    } catch (error) {
      if (token !== this.inflightToken) return;
      this.commit({ kind: "error", error, previous });
    }
  }

  private commit(next: ResourceState<T>): void {
    this._state = next;
  }

  reset(): void {
    this.inflightToken++; // invalidate any in-flight fetch
    this._state = { kind: "idle" };
  }
}
