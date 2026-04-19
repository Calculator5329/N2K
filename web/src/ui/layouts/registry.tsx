/**
 * Layout registry — maps {@link LayoutId} to a React component.
 *
 * Adding a new layout: write a `XyzLayout.tsx` that satisfies
 * {@link LayoutProps}, append the import + entry below, and (if it
 * names a new id) extend the `LayoutId` union in `@platform/themes/types.ts`.
 *
 * Themes pick their layout via `theme.style.layout`; if that field is
 * absent or names an unknown layout the fallback is `SidebarLayout`,
 * which is the most generic / readable.
 */
import type { LayoutId } from "@platform/themes/types.js";
import type { ComponentType } from "react";
import type { LayoutProps } from "./types.js";

import { BoardLayout } from "./BoardLayout.js";
import { ManuscriptLayout } from "./ManuscriptLayout.js";
import { BlueprintLayout } from "./BlueprintLayout.js";
import { ScrapbookLayout } from "./ScrapbookLayout.js";
import { ReceiptLayout } from "./ReceiptLayout.js";
import { PlatformLayout } from "./PlatformLayout.js";
import { PanelsLayout } from "./PanelsLayout.js";
import { FrameLayout } from "./FrameLayout.js";
import { ChartLayout } from "./ChartLayout.js";
import { SidebarLayout } from "./SidebarLayout.js";
import { TopbarLayout } from "./TopbarLayout.js";
import { SpreadsheetLayout } from "./SpreadsheetLayout.js";
import { StudioLayout } from "./StudioLayout.js";
import { SandboxLayout } from "./SandboxLayout.js";

export const LAYOUTS: Readonly<Record<LayoutId, ComponentType<LayoutProps>>> = {
  board: BoardLayout,
  manuscript: ManuscriptLayout,
  blueprint: BlueprintLayout,
  scrapbook: ScrapbookLayout,
  receipt: ReceiptLayout,
  platform: PlatformLayout,
  panels: PanelsLayout,
  frame: FrameLayout,
  chart: ChartLayout,
  sidebar: SidebarLayout,
  topbar: TopbarLayout,
  spreadsheet: SpreadsheetLayout,
  studio: StudioLayout,
  sandbox: SandboxLayout,
};

export function getLayout(id: LayoutId | undefined): ComponentType<LayoutProps> {
  if (id === undefined) return SidebarLayout;
  return LAYOUTS[id] ?? SidebarLayout;
}
