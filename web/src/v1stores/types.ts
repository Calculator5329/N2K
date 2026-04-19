/**
 * Top-level surface ids used by the v1-faithful page chrome.
 *
 * v1 called these "View"; v2's internal layout system calls them
 * `SurfaceId`. We keep both names available so the ported v1 layouts /
 * nav / store-shim compile unchanged.
 */
export type View =
  | "lookup"
  | "explore"
  | "compare"
  | "visualize"
  | "compose"
  | "gallery"
  | "play"
  | "studio"
  | "sandbox"
  | "about";
