import { observer } from "mobx-react-lite";
import { useStore } from "../v1stores/storeContext";
import type { DiceTriple } from "../core/types";

/**
 * Star toggle that adds/removes a dice triple from the persisted
 * favorites set. Theme-token-driven (ink for outline, oxblood for fill)
 * so it inherits the active edition's palette without per-theme
 * overrides.
 *
 * Stops propagation on click so it can be safely embedded inside row
 * click handlers (e.g. the Explore table).
 */
export const FavoriteToggle = observer(function FavoriteToggle({
  dice,
  size = "md",
  className,
}: {
  dice: DiceTriple;
  size?: "sm" | "md";
  className?: string;
}) {
  const { favorites } = useStore();
  const starred = favorites.has(dice);

  const dim = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        favorites.toggle(dice);
      }}
      aria-pressed={starred}
      aria-label={starred ? "Unstar this dice triple" : "Star this dice triple"}
      title={starred ? "Starred — click to unstar" : "Click to star"}
      className={[
        "inline-flex items-center justify-center transition-colors",
        starred
          ? "text-oxblood-500 hover:text-oxblood-500/80"
          : "text-ink-100/40 hover:text-ink-300",
        className ?? "",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 24 24"
        className={dim}
        aria-hidden="true"
        fill={starred ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L12 3.5z" />
      </svg>
    </button>
  );
});
