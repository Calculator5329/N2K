/**
 * Pure-TypeScript validator for {@link Theme} documents.
 *
 * Returns a tagged result so callers never have to try/catch. Field paths
 * use dot/bracket notation (`tokens.color.extras["mist"]`) so they line up
 * with how authors think about the JSON they wrote. No third-party
 * dependencies — the platform package is intentionally dep-free.
 */

import type {
  ColorTokens,
  RadiusTokens,
  ShadowTokens,
  SpacingTokens,
  Theme,
  ThemeMeta,
  ThemeTokens,
  ThemeValidationError,
  TypographyTokens,
  ValidationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Validate a theme document.
 *
 * Behaviour:
 *   - Themes WITHOUT `extends` must populate every required token. They are
 *     standalone and will be rendered directly.
 *   - Themes WITH `extends` may omit any token — the registry merges the
 *     parent's tokens beneath them. The registry re-runs validation in
 *     `strict: true` mode on the resolved theme to confirm completeness.
 *
 * Pass `{ strict: true }` to force the "every required token must be
 * present" rule regardless of `extends` (used internally after resolution).
 */
export function validateTheme(
  input: unknown,
  opts: { readonly strict?: boolean } = {},
): ValidationResult<Theme> {
  const errors: ThemeValidationError[] = [];
  const ctx: Ctx = { errors, path: "" };

  const ok = isPlainObject(input, ctx);
  if (!ok) {
    return { ok: false, errors };
  }

  const meta = readObject(input, "meta", ctx);
  const tokens = readObject(input, "tokens", ctx);
  const extendsId = readOptionalString(input, "extends", ctx);

  // `extends` is optional but if present must be a non-empty string.
  if (extendsId !== undefined && extendsId !== null && extendsId.length === 0) {
    errors.push({ path: join(ctx, "extends"), message: "must be a non-empty string" });
  }

  // Required-field strictness: standalone themes must be complete; themes
  // that extend another theme may declare only the tokens they override.
  const requireRequiredFields = opts.strict === true || extendsId === undefined;

  if (meta) {
    validateMeta(meta, child(ctx, "meta"));
  }
  if (tokens) {
    validateTokens(tokens, child(ctx, "tokens"), requireRequiredFields);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: input as unknown as Theme };
}

// ---------------------------------------------------------------------------
//  Field-level validators
// ---------------------------------------------------------------------------

function validateMeta(value: object, ctx: Ctx): void {
  requireString(value, "id", ctx, KEBAB_ID);
  requireString(value, "displayName", ctx);
  requireString(value, "version", ctx);
  optionalString(value, "authorId", ctx);
  optionalString(value, "summary", ctx);
  optionalStringArray(value, "tags", ctx);
  // Discourage stray keys silently — extra unknown fields are allowed but
  // we surface the type so authors notice typos that produce wrong types.
  // (We do NOT reject unknown keys; future fields should be additive.)
  void (value as ThemeMeta);
}

function validateTokens(value: object, ctx: Ctx, strict: boolean): void {
  // `color` and `typography` groups are required at the document root for
  // standalone themes; for inheritor themes they're optional. The required
  // fields *inside* each group also relax under inheritance.
  if (strict) {
    const color = readObject(value, "color", ctx);
    if (color) validateColor(color, child(ctx, "color"), true);
    const typography = readObject(value, "typography", ctx);
    if (typography) validateTypography(typography, child(ctx, "typography"), true);
  } else {
    if (hasKey(value, "color")) {
      const color = readObject(value, "color", ctx);
      if (color) validateColor(color, child(ctx, "color"), false);
    }
    if (hasKey(value, "typography")) {
      const typography = readObject(value, "typography", ctx);
      if (typography) validateTypography(typography, child(ctx, "typography"), false);
    }
  }

  // Optional groups: only validate if present.
  if (hasKey(value, "spacing")) {
    const spacing = readObject(value, "spacing", ctx);
    if (spacing) {
      validateSpacing(spacing, child(ctx, "spacing"));
    }
  }
  if (hasKey(value, "radius")) {
    const radius = readObject(value, "radius", ctx);
    if (radius) {
      validateRadius(radius, child(ctx, "radius"));
    }
  }
  if (hasKey(value, "shadow")) {
    const shadow = readObject(value, "shadow", ctx);
    if (shadow) {
      validateShadow(shadow, child(ctx, "shadow"));
    }
  }
  void (value as ThemeTokens);
}

function validateColor(value: object, ctx: Ctx, strict: boolean): void {
  if (strict) {
    requireString(value, "bg", ctx);
    requireString(value, "surface", ctx);
    requireString(value, "ink", ctx);
    requireString(value, "inkMuted", ctx);
    requireString(value, "accent", ctx);
    requireString(value, "rule", ctx);
  } else {
    optionalString(value, "bg", ctx);
    optionalString(value, "surface", ctx);
    optionalString(value, "ink", ctx);
    optionalString(value, "inkMuted", ctx);
    optionalString(value, "accent", ctx);
    optionalString(value, "rule", ctx);
  }
  optionalString(value, "success", ctx);
  optionalString(value, "warning", ctx);
  optionalString(value, "danger", ctx);

  if (hasKey(value, "extras")) {
    const extras = (value as Record<string, unknown>)["extras"];
    if (!isObject(extras)) {
      ctx.errors.push({ path: join(ctx, "extras"), message: "must be an object of string→string" });
    } else {
      for (const [key, raw] of Object.entries(extras)) {
        if (typeof raw !== "string" || raw.length === 0) {
          ctx.errors.push({
            path: `${join(ctx, "extras")}["${key}"]`,
            message: "must be a non-empty string",
          });
        }
      }
    }
  }
  void (value as ColorTokens);
}

function validateTypography(value: object, ctx: Ctx, strict: boolean = true): void {
  if (strict) {
    requireString(value, "fontFamilySans", ctx);
  } else {
    optionalString(value, "fontFamilySans", ctx);
  }
  optionalString(value, "fontFamilySerif", ctx);
  optionalString(value, "fontFamilyMono", ctx);
  if (hasKey(value, "scaleRatio")) {
    const ratio = (value as Record<string, unknown>)["scaleRatio"];
    if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
      ctx.errors.push({ path: join(ctx, "scaleRatio"), message: "must be a positive finite number" });
    }
  }
  void (value as TypographyTokens);
}

function validateSpacing(value: object, ctx: Ctx): void {
  const unit = (value as Record<string, unknown>)["unitPx"];
  if (typeof unit !== "number" || !Number.isFinite(unit) || unit <= 0) {
    ctx.errors.push({ path: join(ctx, "unitPx"), message: "must be a positive finite number" });
  }
  void (value as SpacingTokens);
}

function validateRadius(value: object, ctx: Ctx): void {
  requireString(value, "card", ctx);
  requireString(value, "chip", ctx);
  void (value as RadiusTokens);
}

function validateShadow(value: object, ctx: Ctx): void {
  requireString(value, "card", ctx);
  optionalString(value, "popover", ctx);
  void (value as ShadowTokens);
}

// ---------------------------------------------------------------------------
//  Primitive helpers
// ---------------------------------------------------------------------------

interface Ctx {
  readonly errors: ThemeValidationError[];
  readonly path: string;
}

const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function child(ctx: Ctx, key: string): Ctx {
  return { errors: ctx.errors, path: join(ctx, key) };
}

function join(ctx: Ctx, key: string): string {
  return ctx.path.length === 0 ? key : `${ctx.path}.${key}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown, ctx: Ctx): value is Record<string, unknown> {
  if (!isObject(value)) {
    ctx.errors.push({ path: ctx.path || "<root>", message: "must be an object" });
    return false;
  }
  return true;
}

function hasKey(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readObject(parent: object, key: string, ctx: Ctx): Record<string, unknown> | null {
  const raw = (parent as Record<string, unknown>)[key];
  if (raw === undefined) {
    ctx.errors.push({ path: join(ctx, key), message: "is required" });
    return null;
  }
  if (!isObject(raw)) {
    ctx.errors.push({ path: join(ctx, key), message: "must be an object" });
    return null;
  }
  return raw;
}

function readOptionalString(parent: object, key: string, ctx: Ctx): string | undefined | null {
  if (!hasKey(parent, key)) return undefined;
  const raw = (parent as Record<string, unknown>)[key];
  if (typeof raw !== "string") {
    ctx.errors.push({ path: join(ctx, key), message: "must be a string" });
    return null;
  }
  return raw;
}

function requireString(parent: object, key: string, ctx: Ctx, pattern?: RegExp): void {
  const raw = (parent as Record<string, unknown>)[key];
  if (raw === undefined) {
    ctx.errors.push({ path: join(ctx, key), message: "is required" });
    return;
  }
  if (typeof raw !== "string" || raw.length === 0) {
    ctx.errors.push({ path: join(ctx, key), message: "must be a non-empty string" });
    return;
  }
  if (pattern && !pattern.test(raw)) {
    ctx.errors.push({
      path: join(ctx, key),
      message: `must match pattern ${pattern.source}`,
    });
  }
}

function optionalString(parent: object, key: string, ctx: Ctx): void {
  if (!hasKey(parent, key)) return;
  const raw = (parent as Record<string, unknown>)[key];
  if (typeof raw !== "string" || raw.length === 0) {
    ctx.errors.push({ path: join(ctx, key), message: "must be a non-empty string" });
  }
}

function optionalStringArray(parent: object, key: string, ctx: Ctx): void {
  if (!hasKey(parent, key)) return;
  const raw = (parent as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) {
    ctx.errors.push({ path: join(ctx, key), message: "must be an array of strings" });
    return;
  }
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== "string" || entry.length === 0) {
      ctx.errors.push({
        path: `${join(ctx, key)}[${i}]`,
        message: "must be a non-empty string",
      });
    }
  }
}
