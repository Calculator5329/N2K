import { createContext, useContext, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../v1stores/storeContext.js";
import type { ThemeId } from "../core/themes.js";

/**
 * React-context override for the active theme inside a subtree.
 *
 * The global theme lives on the `ThemeStore` (`<html data-theme="…">`)
 * and components like `DiceGlyph` / `Equation` normally read it from
 * `useStore()`. Phase 6's edition gallery needs to render every theme
 * simultaneously without mutating the global store, so each card wraps
 * its preview in a `<ThemeScope theme="…">` that:
 *
 *   1. Sets `data-theme` on a wrapper `<div>` so the CSS variable
 *      blocks in `globals.css` pick up the per-card palette/fonts.
 *   2. Pushes a context value so glyph + equation components render
 *      their per-theme variant (e.g. ASCII for Phosphor) instead of
 *      always rendering the globally selected variant.
 *
 * Any consumer that needs the active theme should call
 * `useActiveThemeId()` instead of `useStore().theme.theme`. Outside of
 * a `<ThemeScope>` it falls through to the store, so non-gallery code
 * paths are unaffected.
 */
const ThemeOverrideContext = createContext<ThemeId | null>(null);

export function ThemeScope({
  theme,
  className,
  children,
}: {
  theme: ThemeId;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ThemeOverrideContext.Provider value={theme}>
      <div data-theme={theme} className={className}>
        {children}
      </div>
    </ThemeOverrideContext.Provider>
  );
}

/**
 * Returns the theme id that should drive component variants in the
 * current subtree. Inside a `<ThemeScope>` returns the overridden id;
 * outside, returns the global store's active theme.
 *
 * Wrapped in an `observer` boundary at the call site is sufficient —
 * this function is a plain hook, not a component, so MobX reactivity
 * works as long as the caller is itself observed.
 */
export function useActiveThemeId(): ThemeId {
  const override = useContext(ThemeOverrideContext);
  const { theme } = useStore();
  return override ?? theme.theme;
}

/** Convenience observer wrapper for callers that aren't already observers. */
export const ActiveThemeId = observer(function ActiveThemeId({
  children,
}: {
  children: (id: ThemeId) => ReactNode;
}) {
  return <>{children(useActiveThemeId())}</>;
});
