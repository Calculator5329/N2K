/**
 * App — root composition.
 *
 * The visual chrome (masthead, nav, footer, edition switcher) is the
 * `PageShell` in `ui/chrome/`, which picks one of 12 layouts off the
 * active theme. Every top-level surface routes through the `view`
 * field on {@link AppStore}; flipping `view` swaps the rendered feature
 * without rebuilding the chrome.
 *
 * v3.2 adds the Library tab + match orchestration:
 *   - `LibraryView`  renders for `view === "library"`
 *   - `PlayRoute`    chooses between Quick Race (no match) and the
 *                     match-aware MatchView (when AppStore.match exists)
 *   - On boot, `MatchResumeGate` checks for an in-flight match
 *     snapshot and surfaces a "Resume? / Discard?" modal before
 *     letting the user interact with the rest of the app.
 */
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";

import { useAppStore } from "./stores/AppStoreContext.js";
import { PageShell } from "./ui/chrome/PageShell.js";
import { SecretBadge } from "./ui/chrome/SecretBadge.js";
import { WelcomeOverlay } from "./ui/chrome/WelcomeOverlay.js";

import { ComposeView } from "./features/compose/ComposeView.js";
import { LookupView } from "./features/lookup/LookupView.js";
import { PlayView } from "./features/play/PlayView.js";
import { LibraryView } from "./features/library/LibraryView.js";
import { MatchView } from "./features/match/MatchView.js";
import {
  MatchStore,
  loadMatchSnapshot,
  clearMatchSnapshot,
} from "./features/match/MatchStore.js";
import { defaultCompetitionLibrary } from "./services/competitionLibrary.js";

import type { View } from "./stores/types.js";

export const App = observer(function App() {
  const store = useAppStore();

  useEffect(() => store.secret.attach(), [store.secret]);

  // Mirror Æther mode onto `<html data-aether="1">` so the cosmic
  // overlay block in `styles.css` (violet vignette, Æ watermark,
  // SecretBadge halo) layers on top of whichever theme is active.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (store.secret.aetherActive) {
      document.documentElement.setAttribute("data-aether", "1");
    } else {
      document.documentElement.removeAttribute("data-aether");
    }
  }, [store.secret.aetherActive]);

  useEffect(() => {
    void store.data.loadIndex();
  }, [store.data]);

  return (
    <>
      <PageShell>{renderView(store.view)}</PageShell>

      <WelcomeOverlay />

      <MatchResumeGate />

      {/*
        Floating SecretBadge — only renders after Konami unlock (the
        badge early-returns null while locked). Mounted globally so the
        toggle is reachable from every layout, not just `SidebarLayout`
        where it is also embedded inline.
      */}
      <div
        className="fixed bottom-3 right-3 z-50 pointer-events-auto"
        style={{ fontSize: 18 }}
      >
        <SecretBadge />
      </div>
    </>
  );
});

function renderView(view: View) {
  switch (view) {
    case "lookup":  return <LookupView />;
    case "compose": return <ComposeView />;
    case "library": return <LibraryView />;
    case "play":    return <PlayRoute />;
  }
}

/**
 * The Play tab is two surfaces in a trenchcoat: a standalone Quick
 * Race (no competition loaded) and the match-aware MatchView (when an
 * `AppStore.match` is in-flight). The match takes precedence so the
 * user can't accidentally start a Quick Race on top of a paused match.
 */
const PlayRoute = observer(function PlayRoute() {
  const store = useAppStore();
  if (store.match !== null) return <MatchView />;
  return <PlayView />;
});

/**
 * Reload-survival gate — checks `match:current` on first mount. When
 * an in-flight match is found we ask the user up front whether to
 * resume it or discard. We don't auto-resume because mid-race timer
 * state isn't persisted (resuming starts the current bout fresh from
 * 0:00); the user should opt in to that.
 */
const MatchResumeGate = observer(function MatchResumeGate() {
  const store = useAppStore();
  const [state, setState] = useState<
    | { kind: "checking" }
    | { kind: "ask"; compName: string; resume: () => Promise<void>; discard: () => Promise<void> }
    | { kind: "done" }
  >({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await loadMatchSnapshot();
      if (cancelled) return;
      if (snap === null) {
        setState({ kind: "done" });
        return;
      }
      const doc = await defaultCompetitionLibrary.load(snap.compId);
      if (doc === null || doc.body.version !== 5) {
        // Source competition is gone — there's nothing to resume.
        await clearMatchSnapshot();
        if (!cancelled) setState({ kind: "done" });
        return;
      }
      const body = doc.body;
      setState({
        kind: "ask",
        compName: snap.compName,
        resume: async () => {
          const match = new MatchStore();
          const ok = match.restoreFromSnapshot(snap, body);
          if (ok) {
            match.attachAutosave();
            store.setMatch(match);
            store.setView("play");
            // Auto-pause immediately — the user just chose to resume,
            // they should hit Resume explicitly to start the timer.
            match.autoPause();
          }
          setState({ kind: "done" });
        },
        discard: async () => {
          await clearMatchSnapshot();
          setState({ kind: "done" });
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (state.kind !== "ask") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-ink-500/60 flex items-start justify-center pt-32 px-4"
    >
      <div
        className="w-full max-w-[420px] bg-paper-50 border border-ink-300 p-6 shadow-2xl"
        style={{ borderRadius: "4px" }}
      >
        <div
          className="font-display text-[22px] text-ink-500 mb-2"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          Resume in-flight match?
        </div>
        <p className="text-[13px] italic text-ink-200 mb-5">
          You left a match in progress: <strong className="not-italic">{state.compName}</strong>.
          Resuming starts the current bout from 0:00; previous bouts keep their scores.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            data-testid="app.resume.discard"
            onClick={() => void state.discard()}
            className="px-4 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
            style={{ borderRadius: "2px" }}
          >
            Discard
          </button>
          <button
            type="button"
            data-testid="app.resume.resume"
            onClick={() => void state.resume()}
            className="px-4 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
            style={{ borderRadius: "2px" }}
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
});
