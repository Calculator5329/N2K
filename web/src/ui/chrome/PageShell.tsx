import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../stores/AppStoreContext.js";
import { THEMES, type LayoutId } from "../../core/themes.js";
import { SidebarLayout }     from "./layouts/SidebarLayout.js";
import { TopbarLayout }      from "./layouts/TopbarLayout.js";
import { ManuscriptLayout }  from "./layouts/ManuscriptLayout.js";
import { BlueprintLayout }   from "./layouts/BlueprintLayout.js";
import { FrameLayout }       from "./layouts/FrameLayout.js";
import { ReceiptLayout }     from "./layouts/ReceiptLayout.js";
import { BoardLayout }       from "./layouts/BoardLayout.js";
import { PlatformLayout }    from "./layouts/PlatformLayout.js";
import { SpreadsheetLayout } from "./layouts/SpreadsheetLayout.js";
import { ScrapbookLayout }   from "./layouts/ScrapbookLayout.js";
import { PanelsLayout }      from "./layouts/PanelsLayout.js";
import { ChartLayout }       from "./layouts/ChartLayout.js";

/**
 * The root page chrome. Picks between layout variants based on the active
 * theme's `layout` field. Each layout owns its own page composition —
 * masthead position, navigation style, content surface, footer.
 *
 * Adding a new layout: implement a component in `ui/layouts/`, extend
 * `LayoutId` in `core/themes.ts`, then add a case below.
 */
/** Mapping from `LayoutId` → page-shell component. */
const LAYOUTS: Record<LayoutId, React.ComponentType<{ children: ReactNode }>> = {
  sidebar:     SidebarLayout,
  topbar:      TopbarLayout,
  manuscript:  ManuscriptLayout,
  blueprint:   BlueprintLayout,
  frame:       FrameLayout,
  receipt:     ReceiptLayout,
  board:       BoardLayout,
  platform:    PlatformLayout,
  spreadsheet: SpreadsheetLayout,
  scrapbook:   ScrapbookLayout,
  panels:      PanelsLayout,
  chart:       ChartLayout,
};

export const PageShell = observer(function PageShell({ children }: { children: ReactNode }) {
  const { theme } = useStore();
  const Layout = LAYOUTS[THEMES[theme.theme].layout] ?? SidebarLayout;
  return (
    <>
      <Layout>{children}</Layout>
      <footer
        className="mx-auto w-full max-w-[1400px] border-t px-4 py-5 text-center font-body text-[12px] sm:px-6 lg:px-10"
        style={{
          borderColor: "rgb(var(--ink-200) / 0.35)",
          color: "rgb(var(--ink-100))",
        }}
        aria-label="More by Ethan"
      >
        <span className="mr-2">More by Ethan:</span>
        <a data-testid="app.footer.projects" href="https://calculator5329.github.io" className="text-accent-500 hover:underline">
          Projects
        </a>{" "}
        ·{" "}
        <a data-testid="app.footer.gatesai" href="https://gatesai.web.app/" title="A local-first AI chat desktop app that runs on cloud models or fully local Ollama." className="text-accent-500 hover:underline">
          GatesAI Chat
        </a>{" "}
        ·{" "}
        <a data-testid="app.footer.fathom" href="https://ethan-488900.web.app" title="Portfolio backtesting, asset allocation and retirement Monte Carlo over 150+ years of market history." className="text-accent-500 hover:underline">
          Fathom
        </a>{" "}
        ·{" "}
        <a data-testid="app.footer.agent-handles" href="https://agent-handles.web.app" title="Makes a web app's interface addressable by AI agents, with a receipt for each action." className="text-accent-500 hover:underline">
          Agent Handles
        </a>{" "}
        ·{" "}
        <a data-testid="app.footer.neon-vector-defense" href="https://neon-vector-defense-7.web.app/?demo=1" title="A sci-fi tower defense game with a deterministic simulation core, exact replays and headless balance sims." className="text-accent-500 hover:underline">
          Neon Vector Defense
        </a>{" "}
        ·{" "}
        <a data-testid="app.footer.github" href="https://github.com/Calculator5329" className="text-accent-500 hover:underline">
          GitHub
        </a>
      </footer>
    </>
  );
});
