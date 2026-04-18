/**
 * Bundled theme loader.
 *
 * Returns the platform's built-in editions as a frozen, validated array.
 * Throws on first invalid bundled theme — that's a build-time bug, not a
 * runtime condition, so failing fast is the right call.
 */

import { BUNDLED_THEMES } from "./editions/index.js";
import { validateTheme } from "./schema.js";
import type { Theme } from "./types.js";

export function loadBundledThemes(): readonly Theme[] {
  for (const theme of BUNDLED_THEMES) {
    const result = validateTheme(theme);
    if (!result.ok) {
      const lines = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
      const id = (theme as Theme | undefined)?.meta?.id ?? "<unknown>";
      throw new Error(`loadBundledThemes: bundled theme "${id}" failed validation\n${lines}`);
    }
  }
  return BUNDLED_THEMES;
}
