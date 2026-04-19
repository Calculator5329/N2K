/**
 * Layout system types.
 *
 * v2 layouts are pure presentational components: they receive `nav`,
 * the active view id, the view children, and the active theme meta,
 * and they render the surrounding chrome (masthead, navigation, footer
 * colophon). They never reach into stores beyond what `LayoutProps`
 * carries — that keeps each layout swappable in tests and reusable in
 * the gallery.
 *
 * The platform's `LayoutId` lives in `@platform/themes` so theme JSON
 * can name the layout it wants. The `LAYOUTS` registry in
 * `./registry.tsx` maps each id to the corresponding component.
 */
import type { ReactNode } from "react";
import type { LayoutId } from "@platform/themes/types.js";
import type { ThemeStore } from "../../stores/ThemeStore.js";

export type SurfaceId =
  | "lookup"
  | "play"
  | "explore"
  | "compare"
  | "visualize"
  | "compose"
  | "gallery"
  | "studio"
  | "sandbox"
  | "about";

export interface NavItem {
  readonly id: SurfaceId;
  readonly label: string;
  /** Roman numeral folio ("I", "II", "III"…). */
  readonly folio: string;
  readonly subtitle: string;
}

export interface LayoutProps {
  readonly nav: readonly NavItem[];
  readonly activeId: SurfaceId;
  readonly onNavigate: (id: SurfaceId) => void;
  readonly children: ReactNode;
  readonly themeId: string;
  readonly themeStore: ThemeStore;
  /** Optional stats line shown in the layout chrome (count, status). */
  readonly statsLine?: string;
}

export type { LayoutId };
