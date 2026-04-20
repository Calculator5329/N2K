/**
 * `AppStore` — the single root store for the entire app.
 *
 * Holds every piece of cross-cutting and feature state behind one
 * dependency that components reach through {@link useAppStore}:
 *
 *   - `data`        — bundled standard dataset (lazy JSON chunks)
 *   - `aetherData`  — Æther sweeps (worker-pool, on-demand)
 *   - `theme`       — active edition (mirrored to `<html data-theme>`)
 *   - `favorites`   — starred dice triples
 *   - `secret`      — Konami unlock + Æther mode latch
 *   - `play`        — live state for the Knockout race surface
 *   - `composition` — editable Competition document (Compose tab)
 *   - `library`     — index of locally-saved competitions (Library tab)
 *   - `match`       — orchestrator for the in-flight competition match
 *                     (null when no match is being played)
 *   - `view`        — currently routed top-level surface
 *
 * Construction is side-effect free aside from the store-internal
 * initialisers (theme reads from localStorage, etc.). The window
 * keydown listener for Konami is attached from `App.tsx` so SSR/test
 * environments without a `window` can construct the store cleanly.
 */
import { makeAutoObservable } from "mobx";

import { AetherDataStore } from "./AetherDataStore.js";
import { DataStore } from "./DataStore.js";
import { FavoritesStore } from "./FavoritesStore.js";
import { PlayStore } from "./PlayStore.js";
import { SecretStore } from "./SecretStore.js";
import { ThemeStore } from "./ThemeStore.js";
import { CompositionStore } from "../features/compose/CompositionStore.js";
import { LibraryStore } from "../features/library/LibraryStore.js";
import type { MatchStore } from "../features/match/MatchStore.js";
import type { View } from "./types.js";

/**
 * Pasted Competition share links carry a `plan=` entry in the URL
 * hash (see `CompositionStore.buildShareUrl` / `loadFromUrl`). When
 * present we boot straight into the Competition tab rather than the
 * default Lookup, so the recipient lands on the surface that will
 * actually rehydrate from their link.
 */
function initialViewFromHash(): View {
  if (typeof window === "undefined") return "lookup";
  const raw = window.location.hash.replace(/^#/, "");
  if (raw.length === 0) return "lookup";
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    if (decodeURIComponent(key) === "plan") return "compose";
  }
  return "lookup";
}

export type { View };

export class AppStore {
  readonly data: DataStore;
  readonly aetherData: AetherDataStore;
  readonly theme: ThemeStore;
  readonly favorites: FavoritesStore;
  readonly secret: SecretStore;
  readonly play: PlayStore;
  readonly composition: CompositionStore;
  readonly library: LibraryStore;
  /**
   * The active competition match, or `null` when the Play tab is in
   * its standalone Quick Race fallback. Set by `LibraryStore.startMatch`
   * (or a reload restore), cleared by `MatchStore.discard()`.
   *
   * Typed as a union so the field can be observed without dragging
   * the MatchStore module into the AppStore's import graph (see
   * dynamic import in `loadMatchModule`); MobX still tracks it.
   */
  match: MatchStore | null = null;
  view: View = initialViewFromHash();

  constructor() {
    this.data = new DataStore();
    this.aetherData = new AetherDataStore();
    this.theme = new ThemeStore();
    this.favorites = new FavoritesStore();
    this.secret = new SecretStore();
    this.play = new PlayStore();
    this.composition = new CompositionStore(this.data);
    this.library = new LibraryStore();
    makeAutoObservable(this, {
      data: false,
      aetherData: false,
      theme: false,
      favorites: false,
      secret: false,
      play: false,
      composition: false,
      library: false,
    });
  }

  setView(view: View): void {
    this.view = view;
    // Auto-pause any in-flight match when the user navigates away from
    // the Play tab. The match is preserved (and the Play tab still
    // shows a paused-takeover when the user returns) — only the
    // race timer is frozen.
    if (view !== "play" && this.match !== null) {
      this.match.autoPause();
    }
  }

  setMatch(match: MatchStore | null): void {
    this.match = match;
  }

  dispose(): void {
    this.play.dispose();
    this.match?.dispose();
  }
}
