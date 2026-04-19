/**
 * FavoriteToggle — star button wired to FavoritesStore.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";

export interface FavoriteToggleProps {
  readonly modeId: string;
  readonly dice: readonly number[];
  readonly size?: "sm" | "md";
  readonly className?: string;
}

export const FavoriteToggle = observer(function FavoriteToggle({
  modeId,
  dice,
  size = "md",
  className,
}: FavoriteToggleProps) {
  const { favorites } = useAppStore();
  const active = favorites.isFavorite(modeId, dice);
  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    favorites.toggle(modeId, dice);
  };
  const dim = size === "sm" ? 14 : 18;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Unfavorite" : "Favorite"}
      title={active ? "Unfavorite" : "Favorite"}
      className={className}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 2,
        color: active ? "var(--color-accent)" : "var(--color-ink-muted)",
        transition: "color 120ms ease",
        lineHeight: 1,
      }}
    >
      <svg width={dim} height={dim} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.5l2.95 6.16 6.8.99-4.92 4.79 1.16 6.77L12 17.95l-6.07 3.26 1.16-6.77L2.25 9.65l6.8-.99L12 2.5z"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
});
