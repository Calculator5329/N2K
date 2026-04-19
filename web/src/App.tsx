/**
 * App — root composition.
 *
 * The visual chrome (masthead, nav, footer, edition switcher) is the
 * v1 PageShell, which picks one of 12 layouts off the active theme. The
 * surfaces inside the chrome are the original v1 feature views (Lookup,
 * Explore, Compare, Visualize, Compose, Gallery, About) — ported under
 * `v1features/` and reading from real v1 stores. The v2-only surfaces
 * (Play, Studio, Sandbox) come from `features/` and read from the v2
 * `AppStore`. The two halves coexist via two contexts, both wired in
 * `main.tsx`.
 */
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useStore } from "./v1stores/storeContext.js";
import { PageShell } from "./v1ui/PageShell.js";
import { LookupView } from "./v1features/lookup/LookupView.js";
import { ExploreView } from "./v1features/explore/ExploreView.js";
import { CompareView } from "./v1features/compare/CompareView.js";
import { VisualizeView } from "./v1features/visualize/VisualizeView.js";
import { ComposeView } from "./v1features/compose/ComposeView.js";
import { GalleryView } from "./v1features/gallery/GalleryView.js";
import { AboutView } from "./v1features/about/AboutView.js";
import { PlayView } from "./features/play/PlayView.js";
import { StudioSurface } from "./features/studio/StudioSurface.js";
import { SandboxSurface } from "./features/sandbox/SandboxSurface.js";

export const App = observer(function App() {
  const v1 = useStore();

  useEffect(() => {
    return v1.secret.attach();
  }, [v1.secret]);

  useEffect(() => {
    void v1.data.loadIndex();
  }, [v1]);

  return (
    <PageShell>
      {renderView(v1.view)}
    </PageShell>
  );
});

function renderView(view: ReturnType<typeof useStore>["view"]) {
  switch (view) {
    case "lookup":    return <LookupView />;
    case "explore":   return <ExploreView />;
    case "compare":   return <CompareView />;
    case "visualize": return <VisualizeView />;
    case "compose":   return <ComposeView />;
    case "play":      return <PlayView />;
    case "gallery":   return <GalleryView />;
    case "studio":    return <StudioSurface />;
    case "sandbox":   return <SandboxSurface />;
    case "about":     return <AboutView />;
  }
}
