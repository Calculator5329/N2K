/**
 * v1-style root store, owned alongside the v2 `AppStore`.
 *
 * The ported v1 chrome (PageShell, layouts, nav, ThemeSelector, Wordmark,
 * SecretBadge) and ported v1 feature views (Lookup, Explore, Compare,
 * Visualize, Compose, Gallery, About) were all written against this
 * shape. Rather than bend each one to v2's structure, we stand up the
 * real v1 stores here and serve the original on-disk dataset out of
 * `public/data/`. The v2 `AppStore` continues to back the v2-only
 * surfaces (Play, Studio, Sandbox).
 */
import { makeAutoObservable } from "mobx";

import type { AppStore as V2AppStore } from "../stores/AppStore.js";
import { AetherDataStore } from "./AetherDataStore.js";
import { CompareStore } from "./CompareStore.js";
import { DataStore } from "./DataStore.js";
import { FavoritesStore } from "./FavoritesStore.js";
import { SecretStore } from "./SecretStore.js";
import { ThemeStore } from "./ThemeStore.js";
import type { View } from "./types.js";

export type { View };

export class V1AppStore {
  readonly data: DataStore;
  readonly aetherData: AetherDataStore;
  readonly theme: ThemeStore;
  readonly favorites: FavoritesStore;
  readonly compare: CompareStore;
  readonly secret: SecretStore;
  /** Reference to the v2 root store, for adapters that need to bridge. */
  readonly v2: V2AppStore;
  view: View = "lookup";

  constructor(v2: V2AppStore) {
    this.v2 = v2;
    this.data = new DataStore();
    this.aetherData = new AetherDataStore();
    this.theme = new ThemeStore();
    this.favorites = new FavoritesStore();
    this.compare = new CompareStore();
    this.secret = new SecretStore();
    makeAutoObservable(this, {
      v2: false,
      data: false,
      aetherData: false,
      theme: false,
      favorites: false,
      compare: false,
      secret: false,
    });
  }

  setView(view: View): void {
    this.view = view;
  }
}
