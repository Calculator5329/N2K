import { observer } from "mobx-react-lite";
import { useStore } from "../v1stores/storeContext.js";

/**
 * Tiny visible-only-when-unlocked badge that signals the Konami unlock to
 * the user. Lives in page-shell footers; renders nothing while locked, so
 * the chrome stays pristine for the public Almanac.
 *
 * Once unlocked, the badge doubles as a *mode toggle*: clicking it flips
 * between standard and Æther mode. The glyph reflects the current mode
 * (filled ✦ = aether active, hollow ✧ = unlocked but currently standard).
 */
export const SecretBadge = observer(function SecretBadge({
  className,
}: {
  className?: string;
}) {
  const { secret } = useStore();
  if (!secret.unlocked) return null;

  const aether = secret.aetherActive;
  const title = aether
    ? "Æther mode active — click to revert to standard"
    : "Æther unlocked — click to enable Æther mode";

  return (
    <button
      type="button"
      onClick={() => secret.toggleMode()}
      className={[
        "inline-flex items-baseline leading-none px-1 -mx-1",
        "transition-colors",
        aether ? "text-oxblood-500" : "text-ink-100 hover:text-oxblood-500",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ letterSpacing: "0.1em" }}
      title={title}
      aria-label={title}
      aria-pressed={aether}
    >
      {aether ? "✦" : "✧"}
    </button>
  );
});
