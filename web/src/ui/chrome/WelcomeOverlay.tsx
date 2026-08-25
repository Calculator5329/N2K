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
          It&apos;s a{" "}
          <span
            className="italic text-oxblood-500"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
          >
            mental-math
          </span>{" "}
          dice race.
        </div>
        <p className="text-[14px] leading-relaxed text-ink-300 mb-5">
          Three dice, a 6×6 board, sixty seconds. Chain the dice with
          <span className="font-mono text-ink-500"> + − × ÷</span> and
          exponents to hit the numbers on your board, and knock them off
          faster than the bot clears theirs.
        </p>

        <ol className="mb-6 space-y-2.5">
          <HowStep ord="1">Three shared dice are rolled at the buzzer.</HowStep>
          <HowStep ord="2">
            Click a cell you can reach with the dice to knock it off.
          </HowStep>
          <HowStep ord="3">
            Beat the bot&apos;s score before the minute runs out.
          </HowStep>
        </ol>

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

        <p className="mt-5 text-[12px] italic text-ink-200">
          Prefer to poke around? Start on{" "}
          <strong className="not-italic text-ink-300">Lookup</strong> to find
          the easiest equation for any three dice, or open{" "}
          <strong className="not-italic text-ink-300">Play</strong> anytime for
          the race.
        </p>
      </div>
    </div>
  );
});

function HowStep({ ord, children }: { ord: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[14px] leading-snug text-ink-300">
      <span
        className="shrink-0 font-display text-[15px] text-oxblood-500 w-5 text-center"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        aria-hidden="true"
      >
        {ord}
      </span>
      <span>{children}</span>
    </li>
  );
}
