/**
 * Canonical Theme schema for the N2K platform.
 *
 * A theme is plain data: a JSON document validated against {@link validateTheme}
 * (see `./schema.ts`) and stored in a {@link import("./registry.js").ThemeRegistry}.
 * Bundled themes ship under `./editions/*.theme.json`; user-authored and
 * AI-generated themes use the same shape, which is the whole point — there is
 * exactly one theme schema, not "built-in" vs "custom".
 *
 * The token map is intentionally **structured** (color group, typography
 * group, spacing group, …) rather than a flat string→string map. The flat
 * legacy form lives in `web/`'s pre-v2 `ThemeStore`; this module is the
 * upgrade and the long-term contract.
 */

// ---------------------------------------------------------------------------
//  Theme document
// ---------------------------------------------------------------------------

export interface Theme {
  readonly meta: ThemeMeta;
  /**
   * Optional id of another theme to inherit defaults from. When the registry
   * resolves inheritance, the parent's tokens become the child's defaults
   * via deep merge — the child only needs to declare the tokens it overrides.
   * Cycles throw at registry construction time.
   */
  readonly extends?: string;
  readonly tokens: ThemeTokens;
  /**
   * Structural skin: which page layout, which dice glyph + equation
   * variant, which ornament glyphs to use. All optional — themes that
   * omit it fall back to the platform defaults (sidebar layout, plain
   * dice tile, ASCII equation, no ornaments).
   *
   * Decoupled from `tokens` because tokens are pure CSS variables
   * shared with arbitrary consumers (Tailwind, third-party editors)
   * while `style` only matters to the v2 web layout system.
   */
  readonly style?: ThemeStyle;
}

export interface ThemeMeta {
  /** Kebab-case, unique within a registry. */
  readonly id: string;
  readonly displayName: string;
  /** Semver-ish; bumped when tokens change meaningfully. */
  readonly version: string;
  /** Author for user-authored / AI-generated themes; omit for bundled. */
  readonly authorId?: string;
  /** One-line description for theme-pickers. */
  readonly summary?: string;
  /** Free-form tags for search / filtering ("dark", "warm", "high-contrast"). */
  readonly tags?: readonly string[];
  /** Short marketing line shown under the wordmark in nav chrome. */
  readonly tagline?: string;
  /**
   * Three swatch colors `[surface, ink, accent]` for the picker flag
   * micro-preview. If omitted, the picker derives them from
   * `tokens.color`.
   */
  readonly swatches?: readonly [string, string, string];
}

/** Page layout to use when the theme is active. */
export type LayoutId =
  | "board"
  | "manuscript"
  | "blueprint"
  | "scrapbook"
  | "receipt"
  | "platform"
  | "panels"
  | "frame"
  | "chart"
  | "sidebar"
  | "topbar"
  | "spreadsheet"
  | "studio"
  | "sandbox";

/** Visual variant of a dice glyph. Drives a CSS class root in v2. */
export type DiceGlyphStyle =
  | "tile"
  | "ascii"
  | "newsroom"
  | "pixel"
  | "illuminated"
  | "blueprint"
  | "tarot"
  | "boardgame"
  | "bullet"
  | "cell"
  | "polaroid"
  | "panel"
  | "buoy";

/** Equation rendering style. */
export type EquationStyle = "ascii" | "pretty";

export interface ThemeOrnaments {
  /** Inline glyph used between nav items in framed layouts. */
  readonly sectionMarker?: string;
  /** Suffix appended to the masthead title. */
  readonly mastheadSuffix?: string;
  /** Glyph rendered in corner-bracket layouts (Frame, Chart, Board). */
  readonly corner?: string;
  /** Style hint for divider rules ("plain", "dashed", "double", "ornament"). */
  readonly ruleStyle?: "plain" | "dashed" | "double" | "ornament";
}

export interface ThemeStyle {
  readonly layout?: LayoutId;
  readonly glyph?: DiceGlyphStyle;
  readonly equation?: EquationStyle;
  readonly ornaments?: ThemeOrnaments;
  /**
   * Optional difficulty heatmap stops, low → high. Visualize / Explore
   * use this to color the histogram and atlas; falls back to a neutral
   * 5-stop ramp built from `accent` + `ink-muted`.
   */
  readonly scale?: ThemeScale;
}

export interface ThemeScale {
  readonly stops: readonly string[];
  /** Color for "no solution" cells; defaults to `inkMuted`. */
  readonly impossible?: string;
}

// ---------------------------------------------------------------------------
//  Token groups
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  readonly color: ColorTokens;
  readonly typography: TypographyTokens;
  readonly spacing?: SpacingTokens;
  readonly radius?: RadiusTokens;
  readonly shadow?: ShadowTokens;
}

export interface ColorTokens {
  readonly bg: string;
  readonly surface: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly accent: string;
  readonly rule: string;
  readonly success?: string;
  readonly warning?: string;
  readonly danger?: string;
  /** Optional 1..N additional named swatches for richer themes. */
  readonly extras?: Readonly<Record<string, string>>;
}

export interface TypographyTokens {
  readonly fontFamilySans: string;
  readonly fontFamilySerif?: string;
  readonly fontFamilyMono?: string;
  /** Modular type scale ratio (default 1.2 if omitted). */
  readonly scaleRatio?: number;
}

export interface SpacingTokens {
  /** Base spacing unit in CSS pixels (default 4 if the group is omitted). */
  readonly unitPx: number;
}

export interface RadiusTokens {
  readonly card: string;
  readonly chip: string;
}

export interface ShadowTokens {
  readonly card: string;
  readonly popover?: string;
}

// ---------------------------------------------------------------------------
//  Validation
// ---------------------------------------------------------------------------

export interface ThemeValidationError {
  /** Dot-path to the offending field, e.g. "tokens.color.bg". */
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ThemeValidationError[] };
