/**
 * WelcomeOverlay — first-run onboarding.
 *
 * A stranger lands on the site (default surface: Lookup) with no idea
 * that N2K is a game. This overlay appears once — gated by
 * {@link OnboardingStore} on a localStorage flag — to say what the site
 * is in a sentence and hand the visitor a single-click on-ramp to a
 * running race ("Play a Quick Race" → Play tab + `play.start()`), so
 * the acceptance criterion (a finished race in ≤ 2 clicks, unaided) is
 * reachable from a cold landing.
 *
 * Returning players never see it again. It also stands down when a
 * match-resume prompt is pending so the two modals don't stack.
 *
 * Styling mirrors the `MatchResumeGate` modal in `App.tsx` — the same
 * paper card / oxblood accents / editorial type — so it reads as part
 * of the existing chrome rather than a bolt-on.
 */
import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";

export const WelcomeOverlay = observer(function WelcomeOverlay() {
  const store = useAppStore();
  const { onboarding, play } = store;
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Escape dismisses (treated as "explore first" — no race launched).
  useEffect(() => {
    if (!onboarding.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onboarding.dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onboarding, onboarding.open]);

  // Land focus on the primary CTA so Enter starts a race immediately.
  useEffect(() => {
    if (onboarding.open) primaryRef.current?.focus();
  }, [onboarding.open]);

  // Don't cover a share-link match-resume prompt (they can't both be
  // first-run, but guard defensively so modals never stack).
  if (!onboarding.open || store.match !== null) return null;

  const startQuickRace = () => {
    onboarding.dismiss();
    store.setView("play");
    play.start();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-[55] bg-ink-500/60 flex items-start justify-center pt-20 sm:pt-28 px-4 overflow-y-auto"
    >
      <div
        className="w-full max-w-[480px] bg-paper-50 border border-ink-300 p-6 sm:p-8 shadow-2xl my-8"
        style={{ borderRadius: "4px" }}
      >
        <div className="font-mono uppercase tracking-wide-caps text-[11px] text-oxblood-500 mb-3">
          Welcome
        </div>
        <div
          id="welcome-title"
          className="font-display text-[26px] sm:text-[30px] leading-tight text-ink-500 mb-3"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          An{" "}
          <span
            className="italic text-oxblood-500"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
          >
            almanac
          </span>{" "}
          for the N2K dice game.
        </div>
        <p className="text-[14px] leading-relaxed text-ink-300 mb-6">
          Pick three dice and a target, and Lookup shows the easiest
          equation that hits it. You can also build competition boards,
          keep them in a library, or race a bot for sixty seconds.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            ref={primaryRef}
            type="button"
            data-testid="welcome.actions.quick-race"
            onClick={startQuickRace}
            className="px-6 py-3 font-mono uppercase tracking-wide-caps text-[12px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90 transition-colors"
            style={{ borderRadius: "2px" }}
          >
            Play a Quick Race
          </button>
          <button
            type="button"
            data-testid="welcome.actions.explore"
            onClick={() => onboarding.dismiss()}
            className="px-4 py-2 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
            style={{ borderRadius: "2px" }}
          >
            Explore first
          </button>
        </div>
      </div>
    </div>
  );
});
