/**
 * PageShell — root chrome.
 *
 * Reads the active theme, picks the matching layout from the registry,
 * and renders the current view inside it. Lives at the root of the
 * React tree (just below `<AppStoreContext.Provider>`) so every layout
 * has access to the platform stores.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { NAV_ITEMS } from "./nav.js";
import { getLayout } from "./registry.js";
import type { SurfaceId } from "./types.js";

export interface PageShellProps {
  readonly activeSurface: SurfaceId;
  readonly onNavigate: (id: SurfaceId) => void;
  readonly statsLine?: string;
  readonly children: React.ReactNode;
}

export const PageShell = observer(function PageShell({
  activeSurface,
  onNavigate,
  statsLine,
  children,
}: PageShellProps) {
  const store = useAppStore();
  const layoutId = store.theme.activeTheme.style?.layout;
  const Layout = getLayout(layoutId);
  return (
    <Layout
      nav={NAV_ITEMS}
      activeId={activeSurface}
      onNavigate={onNavigate}
      themeId={store.theme.activeId}
      themeStore={store.theme}
      statsLine={statsLine}
    >
      {children}
    </Layout>
  );
});
