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
 *   - `view`        — currently routed top-level surface, mirrored
 *                     into the URL hash (see `viewHash.ts`)
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
import { DailyChallengeStore } from "./DailyChallengeStore.js";
import { OnboardingStore } from "./OnboardingStore.js";
import { CompositionStore } from "../features/compose/CompositionStore.js";
import { LibraryStore } from "../features/library/LibraryStore.js";
import type { MatchStore } from "../features/match/MatchStore.js";
import type { View } from "./types.js";
import { hashForView, viewFromHash } from "./viewHash.js";

export type { View };

export class AppStore {
  readonly data: DataStore;
  readonly aetherData: AetherDataStore;
  readonly theme: ThemeStore;
  readonly favorites: FavoritesStore;
  readonly secret: SecretStore;
  readonly play: PlayStore;
  readonly daily: DailyChallengeStore;
  readonly onboarding: OnboardingStore;
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
  view: View = typeof window === "undefined" ? "lookup" : viewFromHash(window.location.hash);

  constructor() {
    this.data = new DataStore();
    this.aetherData = new AetherDataStore();
    this.theme = new ThemeStore();
    this.favorites = new FavoritesStore();
    this.secret = new SecretStore();
    this.play = new PlayStore();
    this.daily = new DailyChallengeStore();
    this.onboarding = new OnboardingStore();
    this.composition = new CompositionStore(this.data);
    this.library = new LibraryStore();
    makeAutoObservable(this, {
      data: false,
      aetherData: false,
      theme: false,
      favorites: false,
      secret: false,
      play: false,
      daily: false,
      onboarding: false,
      composition: false,
      library: false,
    });
  }

  /**
   * User navigation between top-level views. A real change pushes a
   * history entry so Back/Forward walk between views inside the site.
   */
  setView(view: View): void {
    const changed = view !== this.view;
    this.showView(view);
    if (changed && typeof window !== "undefined") {
      window.history.pushState(window.history.state, "", urlWithHash(hashForView(window.location.hash, view)));
    }
  }

  private showView(view: View): void {
    this.view = view;
    // Auto-pause the in-flight race when the user navigates away from
    // the Play tab: the match bout if one is loaded, and the Quick Race
    // (or Daily) otherwise. The race is preserved and Play shows it
    // paused with Resume on return; a paused race refuses knocks. A
    // playing replay stops on its current frame.
    if (view !== "play") {
      this.play.pause();
      this.play.pauseReplay();
      this.match?.autoPause();
    }
  }

  /**
   * Follow Back/Forward and hand-edited hashes, and stamp the current
   * view into the hash (a `race=` link that opened Play keeps Play on
   * reload after the payload is consumed). Called from a `useEffect` in
   * `App`; returns the cleanup.
   */
  startHistorySync(): () => void {
    if (typeof window === "undefined") return () => {};
    const canonical = hashForView(window.location.hash, this.view);
    if (canonical !== window.location.hash.replace(/^#/, "")) {
      window.history.replaceState(window.history.state, "", urlWithHash(canonical));
    }
    const follow = (): void => {
      const next = viewFromHash(window.location.hash);
      if (next !== this.view) this.showView(next);
    };
    window.addEventListener("popstate", follow);
    window.addEventListener("hashchange", follow);
    return () => {
      window.removeEventListener("popstate", follow);
      window.removeEventListener("hashchange", follow);
    };
  }

  /** A loaded match takes over the Play tab, so the Quick Race under it pauses. */
  setMatch(match: MatchStore | null): void {
    if (match !== null) this.play.pause();
    this.match = match;
  }

  dispose(): void {
    this.play.dispose();
    this.match?.dispose();
  }
}

function urlWithHash(hash: string): string {
  return `${window.location.pathname}${window.location.search}${hash.length > 0 ? `#${hash}` : ""}`;
}
