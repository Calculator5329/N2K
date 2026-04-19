/**
 * GalleryView — quick preview of the bundled themes side-by-side.
 *
 * Each tile mounts an isolated container with the theme's CSS variables
 * inlined, so visitors can see how every surface, text, and accent reads
 * before committing to a switch in the global header.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import {
  loadBundledThemes,
  type Theme,
} from "@platform/themes/index.js";
import { PageHeader } from "../../ui/primitives/PageHeader.js";
import { navItemById } from "../../ui/layouts/nav.js";

const SAMPLE_DICE = [3, 5, 8] as const;
const SAMPLE_TARGETS = [12, 24, 39, 64, 96, 144] as const;

export const GalleryView = observer(function GalleryView() {
  const { theme } = useAppStore();
  const themes = loadBundledThemes();
  const item = navItemById("gallery");
  return (
    <div className="space-y-4">
      <PageHeader
        folio={item.folio}
        eyebrow="Every edition"
        title="Gallery"
        dek="Every bundled theme rendered with the same demo content. Click a tile to make it active everywhere."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map((t) => (
          <ThemeTile
            key={t.meta.id}
            theme={t}
            active={theme.activeId === t.meta.id}
            onActivate={() => theme.setActive(t.meta.id)}
          />
        ))}
      </div>
    </div>
  );
});

function ThemeTile(props: { theme: Theme; active: boolean; onActivate: () => void }) {
  const cssVars = themeAsCssVars(props.theme);
  return (
    <button
      type="button"
      onClick={props.onActivate}
      className="text-left p-0 rounded overflow-hidden transition"
      style={{
        outline: props.active ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
        outlineOffset: 0,
        background: "transparent",
      }}
    >
      <div style={cssVars}>
        <div
          className="p-4 space-y-3"
          style={{
            background: "var(--theme-color-bg)",
            color: "var(--theme-color-ink)",
            borderRadius: "var(--theme-radius-card)",
          }}
        >
          <header className="flex items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{props.theme.meta.displayName}</h3>
              <p className="text-xs" style={{ color: "var(--theme-color-ink-muted)" }}>
                {props.theme.meta.summary ?? props.theme.meta.id}
              </p>
            </div>
            {props.active ? (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "var(--theme-color-accent)", color: "var(--theme-color-bg)" }}
              >
                Active
              </span>
            ) : null}
          </header>

          <div
            className="p-3"
            style={{
              background: "var(--theme-color-surface)",
              color: "var(--theme-color-ink)",
              borderRadius: "var(--theme-radius-card)",
              boxShadow: "var(--theme-shadow-card)",
            }}
          >
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--theme-color-ink-muted)" }}>
              Sample dice
            </p>
            <p className="text-xl font-semibold tabular-nums">{SAMPLE_DICE.join(" · ")}</p>
            <div className="mt-3 grid grid-cols-6 gap-1">
              {SAMPLE_TARGETS.map((t, i) => (
                <div
                  key={t}
                  className="aspect-square text-xs flex items-center justify-center font-medium tabular-nums"
                  style={{
                    background: i % 2 === 0 ? "var(--theme-color-bg)" : "var(--theme-color-surface)",
                    color: "var(--theme-color-ink)",
                    border: "1px solid var(--theme-color-rule)",
                    borderRadius: "calc(var(--theme-radius-card) / 4)",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {(props.theme.meta.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--theme-color-surface)",
                  color: "var(--theme-color-ink-muted)",
                  border: "1px solid var(--theme-color-rule)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Flatten a theme's structured tokens into inlinable CSS variables, prefixed
 * with `--theme-` so they don't conflict with the page-level `--color-*`
 * variables set by `ThemeStore.applyTo(document.documentElement)`.
 */
function themeAsCssVars(theme: Theme): React.CSSProperties {
  const vars: Record<string, string> = {};
  for (const [name, value] of flattenTokens(theme)) {
    vars[`--theme-${name}`] = value;
  }
  return vars as unknown as React.CSSProperties;
}

function flattenTokens(theme: Theme): ReadonlyArray<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  walk(theme.tokens as unknown as Record<string, unknown>, [], out);
  return out;
}

function walk(
  obj: Record<string, unknown>,
  trail: string[],
  out: Array<readonly [string, string]>,
): void {
  for (const [k, v] of Object.entries(obj)) {
    const path = [...trail, kebab(k)];
    if (v !== null && typeof v === "object") {
      walk(v as Record<string, unknown>, path, out);
    } else if (typeof v === "string" || typeof v === "number") {
      out.push([path.join("-"), String(v)]);
    }
  }
}

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
