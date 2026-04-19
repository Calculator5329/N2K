/**
 * In-memory registry of {@link Theme}s.
 *
 * The registry validates every theme it accepts and (by default) resolves
 * `extends` chains by deep-merging parent tokens beneath the child's
 * declared tokens. Cycles throw at construction time with the offending
 * chain printed.
 *
 * Apps construct their own registry instance — there is no global. The web
 * UI wraps `loadBundledThemes()` in a registry; an in-app theme editor
 * later layers user-authored themes over the same registry instance.
 */

import { validateTheme } from "./schema.js";
import type {
  ColorTokens,
  RadiusTokens,
  ShadowTokens,
  SpacingTokens,
  Theme,
  ThemeTokens,
  TypographyTokens,
} from "./types.js";

export interface ThemeRegistryOptions {
  readonly themes: readonly Theme[];
  /**
   * If true (default), themes with `extends: "<id>"` inherit the parent's
   * tokens via deep merge before being stored. If false, themes are stored
   * as authored and `extends` is metadata-only.
   */
  readonly resolveInheritance?: boolean;
}

export class ThemeRegistry {
  private readonly byIdMap = new Map<string, Theme>();
  private readonly resolveInheritance: boolean;

  constructor(opts: ThemeRegistryOptions) {
    this.resolveInheritance = opts.resolveInheritance ?? true;

    // Two-pass insert: index raw themes first so we can resolve `extends`
    // chains against the full set regardless of declaration order.
    const raw = new Map<string, Theme>();
    for (const theme of opts.themes) {
      assertValid(theme);
      if (raw.has(theme.meta.id)) {
        throw new Error(`ThemeRegistry: duplicate theme id "${theme.meta.id}"`);
      }
      raw.set(theme.meta.id, theme);
    }

    for (const theme of raw.values()) {
      const resolved = this.resolveInheritance ? resolveChain(theme, raw) : theme;
      if (this.resolveInheritance) assertResolvedComplete(resolved);
      this.byIdMap.set(resolved.meta.id, resolved);
    }
  }

  byId(id: string): Theme | null {
    return this.byIdMap.get(id) ?? null;
  }

  all(): readonly Theme[] {
    return [...this.byIdMap.values()];
  }

  register(theme: Theme, opts?: { readonly replace?: boolean }): void {
    assertValid(theme);
    if (this.byIdMap.has(theme.meta.id) && !opts?.replace) {
      throw new Error(
        `ThemeRegistry: theme "${theme.meta.id}" already registered (pass { replace: true } to overwrite)`,
      );
    }
    if (this.resolveInheritance && theme.extends) {
      const snapshot = new Map(this.byIdMap);
      snapshot.set(theme.meta.id, theme);
      const resolved = resolveChain(theme, snapshot);
      assertResolvedComplete(resolved);
      this.byIdMap.set(theme.meta.id, resolved);
    } else {
      if (this.resolveInheritance) assertResolvedComplete(theme);
      this.byIdMap.set(theme.meta.id, theme);
    }
  }

  /**
   * Returns a NEW registry containing every existing theme plus `theme`
   * (replacing any existing entry with the same id). The receiver is not
   * mutated — convenient for store-style consumers that prefer immutable
   * snapshots.
   */
  with(theme: Theme): ThemeRegistry {
    const next = [...this.byIdMap.values()].filter((t) => t.meta.id !== theme.meta.id);
    next.push(theme);
    return new ThemeRegistry({ themes: next, resolveInheritance: this.resolveInheritance });
  }
}

// ---------------------------------------------------------------------------
//  Inheritance resolver
// ---------------------------------------------------------------------------

function resolveChain(theme: Theme, all: ReadonlyMap<string, Theme>): Theme {
  const chain: Theme[] = [];
  const seen = new Set<string>();
  let cursor: Theme | undefined = theme;
  while (cursor) {
    if (seen.has(cursor.meta.id)) {
      const cycle = [...chain.map((t) => t.meta.id), cursor.meta.id].join(" -> ");
      throw new Error(`ThemeRegistry: cyclic extends chain detected: ${cycle}`);
    }
    seen.add(cursor.meta.id);
    chain.push(cursor);
    if (!cursor.extends) break;
    const parent = all.get(cursor.extends);
    if (!parent) {
      throw new Error(
        `ThemeRegistry: theme "${cursor.meta.id}" extends unknown theme "${cursor.extends}"`,
      );
    }
    cursor = parent;
  }

  if (chain.length === 1) {
    // No parent — return as-authored (still drop the `extends` field if absent).
    return chain[0]!;
  }

  // Merge from the eldest ancestor downward so closer descendants win.
  let mergedTokens: ThemeTokens | null = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const link = chain[i]!;
    mergedTokens = mergedTokens === null ? link.tokens : mergeTokens(mergedTokens, link.tokens);
  }

  // Resolve `style` similarly — eldest first, child fields win.
  let mergedStyle: Theme["style"] | undefined;
  for (let i = chain.length - 1; i >= 0; i--) {
    const link = chain[i]!;
    if (link.style === undefined) continue;
    if (mergedStyle === undefined) {
      mergedStyle = link.style;
      continue;
    }
    mergedStyle = {
      ...mergedStyle,
      ...link.style,
      ornaments:
        link.style.ornaments !== undefined || mergedStyle.ornaments !== undefined
          ? { ...(mergedStyle.ornaments ?? {}), ...(link.style.ornaments ?? {}) }
          : undefined,
      scale: link.style.scale ?? mergedStyle.scale,
    };
  }

  // Strip `extends` from the resolved theme — it's already been applied.
  return {
    meta: theme.meta,
    tokens: mergedTokens!,
    ...(mergedStyle !== undefined ? { style: mergedStyle } : {}),
  };
}

// ---------------------------------------------------------------------------
//  Token deep-merge — child wins, undefined keys never overwrite
// ---------------------------------------------------------------------------

function mergeTokens(parent: ThemeTokens, child: ThemeTokens | undefined): ThemeTokens {
  // Child tokens may be entirely absent, or any group inside may be absent
  // — that's fine, we fall back to the parent for whatever's missing.
  const childColor = child?.color;
  const childTypography = child?.typography;
  return {
    color: childColor ? mergeColor(parent.color, childColor) : parent.color,
    typography: childTypography
      ? mergeTypography(parent.typography, childTypography)
      : parent.typography,
    ...(merged("spacing", parent.spacing, child?.spacing, mergeSpacing)),
    ...(merged("radius", parent.radius, child?.radius, mergeRadius)),
    ...(merged("shadow", parent.shadow, child?.shadow, mergeShadow)),
  };
}

/**
 * Helper that returns either `{ [key]: value }` (when at least one of the
 * two operands is defined) or `{}` (when both are undefined). Lets us keep
 * optional groups truly optional in the merged output.
 */
function merged<K extends string, V>(
  key: K,
  parent: V | undefined,
  child: Partial<V> | undefined,
  combine: (p: V, c: Partial<V>) => V,
): Partial<Record<K, V>> {
  if (parent === undefined && child === undefined) return {};
  if (parent === undefined) return { [key]: child! as V } as Record<K, V>;
  if (child === undefined) return { [key]: parent } as Record<K, V>;
  return { [key]: combine(parent, child) } as Record<K, V>;
}

function mergeColor(parent: ColorTokens, child: Partial<ColorTokens>): ColorTokens {
  const extras: Record<string, string> = {
    ...(parent.extras ?? {}),
    ...(child.extras ?? {}),
  };
  const result: Record<string, unknown> = {
    bg: child.bg ?? parent.bg,
    surface: child.surface ?? parent.surface,
    ink: child.ink ?? parent.ink,
    inkMuted: child.inkMuted ?? parent.inkMuted,
    accent: child.accent ?? parent.accent,
    rule: child.rule ?? parent.rule,
  };
  pickOptional(result, "success", parent.success, child.success);
  pickOptional(result, "warning", parent.warning, child.warning);
  pickOptional(result, "danger", parent.danger, child.danger);
  if (Object.keys(extras).length > 0) result["extras"] = extras;
  return result as unknown as ColorTokens;
}

function mergeTypography(
  parent: TypographyTokens,
  child: Partial<TypographyTokens>,
): TypographyTokens {
  const result: Record<string, unknown> = {
    fontFamilySans: child.fontFamilySans ?? parent.fontFamilySans,
  };
  pickOptional(result, "fontFamilySerif", parent.fontFamilySerif, child.fontFamilySerif);
  pickOptional(result, "fontFamilyMono", parent.fontFamilyMono, child.fontFamilyMono);
  pickOptional(result, "scaleRatio", parent.scaleRatio, child.scaleRatio);
  return result as unknown as TypographyTokens;
}

function mergeSpacing(parent: SpacingTokens, child: Partial<SpacingTokens>): SpacingTokens {
  return { unitPx: child.unitPx ?? parent.unitPx };
}

function mergeRadius(parent: RadiusTokens, child: Partial<RadiusTokens>): RadiusTokens {
  return {
    card: child.card ?? parent.card,
    chip: child.chip ?? parent.chip,
  };
}

function mergeShadow(parent: ShadowTokens, child: Partial<ShadowTokens>): ShadowTokens {
  const result: Record<string, unknown> = {
    card: child.card ?? parent.card,
  };
  pickOptional(result, "popover", parent.popover, child.popover);
  return result as unknown as ShadowTokens;
}

function pickOptional<T>(
  target: Record<string, unknown>,
  key: string,
  parent: T | undefined,
  child: T | undefined,
): void {
  if (child !== undefined) target[key] = child;
  else if (parent !== undefined) target[key] = parent;
}

// ---------------------------------------------------------------------------
//  Validation gate
// ---------------------------------------------------------------------------

function assertValid(theme: Theme): void {
  const result = validateTheme(theme);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `ThemeRegistry: invalid theme${theme?.meta?.id ? ` "${theme.meta.id}"` : ""}\n${lines}`,
    );
  }
}

/**
 * After inheritance resolution every required token must be present —
 * partial child themes are only legal because their parent supplies the
 * missing pieces. Catches "child extends X but X doesn't define field Y"
 * authoring mistakes at registration time.
 */
function assertResolvedComplete(theme: Theme): void {
  const result = validateTheme(theme, { strict: true });
  if (!result.ok) {
    const lines = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `ThemeRegistry: theme "${theme.meta.id}" is incomplete after extends-resolution\n${lines}`,
    );
  }
}
