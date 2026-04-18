/**
 * Public entry point for the themes module.
 *
 * Consumers (web/, future native shells, AI theme generators) import from
 * `themes/` rather than reaching into individual files.
 */

export type {
  Theme,
  ThemeMeta,
  ThemeTokens,
  ColorTokens,
  TypographyTokens,
  SpacingTokens,
  RadiusTokens,
  ShadowTokens,
  ThemeValidationError,
  ValidationResult,
} from "./types.js";

export { validateTheme } from "./schema.js";
export { ThemeRegistry, type ThemeRegistryOptions } from "./registry.js";
export { loadBundledThemes } from "./loader.js";
export { BUNDLED_THEMES, BUNDLED_THEME_IDS } from "./editions/index.js";
