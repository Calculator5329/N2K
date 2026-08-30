# PLAN-C — Theme registry as data + bundled editions

**Branch:** `agent/themes-as-data`
**Estimated scope:** ~400–700 LoC + tests + 5–17 JSON theme files
**Depends on:** Phase 0 foundation (already on `main`)
**Blocks:** Phase 4 web Theme/Edition UI (the web ThemeStore will swap its inline built-ins for this registry)

## Goal

Define the **canonical Theme schema** and ship the **first batch of bundled editions as DATA**, not code. Today the web `ThemeStore` hard-codes `tabletop` + `noir` inline. After this plan lands:

- Themes are JSON documents validated against a strict schema.
- A pure-TS `ThemeRegistry` loads them, exposes `byId(id)` and `all()`, and reports validation errors with file paths.
- The Tabletop edition (the user's chosen foundation) is the first fully-fleshed theme; 4–6 contrasting editions follow to prove the schema scales.
- User-authored themes (created in-app) and AI-generated themes will use the **exact same schema**, which is the whole point.

This is the foundation for Phase 6 ("Persisted custom themes as `ThemeDoc`") and the AI theming feature.

## File boundary

### WILL create

- `src/themes/types.ts` — `Theme`, `ThemeTokens`, `ThemeMeta`, `ThemeValidationError`. The token map is structured (color group, typography group, spacing group, shadow group, radius group) — NOT a flat string→string map. The flat form lives in `web/`'s legacy `ThemeStore`; this is the upgrade.
- `src/themes/schema.ts` — pure-TS validator (zero runtime deps). Returns `{ ok: true, value } | { ok: false, errors }`. No third-party validator library — keeps the package dependency-free.
- `src/themes/registry.ts` — `ThemeRegistry` class. Construct with `Theme[]`, exposes `byId(id) → Theme | null`, `all() → readonly Theme[]`, `register(theme) → void` (validates before accepting). Throws on duplicate ids unless `replace: true` is passed.
- `src/themes/loader.ts` — `loadBundledThemes(): readonly Theme[]`. Imports every `*.theme.json` from `editions/` via Vite/tsx-friendly dynamic imports OR a static index file (preferred — see "Bundling note" below).
- `src/themes/editions/index.ts` — static `[tabletop, noir, ...]` array re-exporting parsed JSON. Keeps the bundle deterministic.
- `src/themes/editions/tabletop.theme.json` — **the canonical foundation theme.** Must include every token in the schema; serves as the implicit fallback for editions that omit tokens.
- `src/themes/editions/noir.theme.json` — dark contrast theme.
- `src/themes/editions/<at least 3 more>.theme.json` — your pick, but each must demonstrate one schema feature (e.g. one with custom typography, one with a saturated accent palette, one with a heavy shadow style). Suggested: `frost`, `ember`, `verdant`. Port colors/feel from v1 editions if useful, but the schema is fresh — don't try to be 100% v1-faithful.
- `tests/themes/schema.test.ts` — schema validation: rejects missing required fields, accepts well-formed input, reports field paths in errors.
- `tests/themes/registry.test.ts` — register / byId / all / duplicate handling.
- `tests/themes/editions.test.ts` — for EVERY bundled `*.theme.json`, asserts `validate(theme).ok === true`. Catches schema drift in edition files.
- `tests/themes/inheritance.test.ts` — verifies the `extends: "tabletop"` token-merge behavior (see "Inheritance" below).

### MAY modify

- `package.json` — no new dependencies. May add `"validate-themes": "tsx src/themes/cli/validate.ts"` script if you ship a CLI helper.
- `tsconfig.json` — add `"resolveJsonModule": true` if not already present (Phase 0 already enabled it; verify).
- `docs/changelog.md` — append a "Themes as data" section.
- `docs/roadmap.md` — check off Phase 6 theme-related boxes.

### MUST NOT touch

- `src/core/`, `src/services/` — foundation is stable. The themes module imports from `core/types.ts` only if it needs to (it probably doesn't — themes don't reference `Mode` or `NEquation`).
- `web/` — the web `ThemeStore` upgrade is Phase 4 work. It will consume this registry but the wiring is the next agent's job.

## Concrete API contracts

### `src/themes/types.ts`

```ts
export interface Theme {
  readonly meta: ThemeMeta;
  /** Optional id of another theme to inherit defaults from. */
  readonly extends?: string;
  readonly tokens: ThemeTokens;
}

export interface ThemeMeta {
  readonly id: string;        // kebab-case, unique within a registry
  readonly displayName: string;
  readonly version: string;   // semver-ish; bumped when tokens change meaningfully
  readonly authorId?: string; // for user-authored themes
  readonly summary?: string;  // one-line description for theme-pickers
  readonly tags?: readonly string[];
}

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
  readonly scaleRatio?: number; // default 1.2
}

export interface SpacingTokens { readonly unitPx: number; }                // default 4
export interface RadiusTokens  { readonly card: string; readonly chip: string; }
export interface ShadowTokens  { readonly card: string; readonly popover?: string; }
```

### `src/themes/schema.ts`

```ts
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ThemeValidationError[] };

export interface ThemeValidationError {
  /** Dot-path to the offending field, e.g. "tokens.color.bg". */
  readonly path: string;
  readonly message: string;
}

export function validateTheme(input: unknown): ValidationResult<Theme>;
```

### `src/themes/registry.ts`

```ts
export interface ThemeRegistryOptions {
  readonly themes: readonly Theme[];
  /**
   * If a theme has `extends: "<id>"`, registry inherits the parent's tokens
   * via deep merge. Throws on cycle.
   */
  readonly resolveInheritance?: boolean; // default true
}

export class ThemeRegistry {
  constructor(opts: ThemeRegistryOptions);
  byId(id: string): Theme | null;
  all(): readonly Theme[];
  register(theme: Theme, opts?: { readonly replace?: boolean }): void;
  /** Returns a NEW registry with the theme appended/replaced (immutable variant). */
  with(theme: Theme): ThemeRegistry;
}
```

### Inheritance

`extends: "tabletop"` makes the tabletop tokens the defaults; the child's `tokens.*` deep-merge over them. This means a custom theme can override just `tokens.color.accent` without re-declaring every other token. Cycle detection is required (throw with a useful message).

### Bundling note

Use a **static index file** (`editions/index.ts` re-exporting each JSON via `import x from "./x.theme.json"`) rather than dynamic globbing. This keeps Vite, tsx, and Node test runners happy without per-runtime config tweaks.

## Acceptance criteria

- `npm run typecheck` clean.
- `npm test` clean — at least 30 new tests across `tests/themes/`.
- Every bundled `*.theme.json` validates without error.
- The Tabletop theme is **complete** — every required and every optional token populated. It's the documentation-by-example for theme authors.
- At least 5 bundled themes total (tabletop, noir, + 3 more), each demonstrating distinct visual character.
- A theme with `extends: "tabletop"` and only one overridden token works end-to-end (verified by test).
- Cycle in `extends` chain throws a clear error with the chain printed.

## Stretch goals

- A `validate-themes` CLI (`tsx src/themes/cli/validate.ts <glob>`) that lints user-provided JSON files and exits non-zero on failure. Useful for the future "import a theme from a URL" feature.
- A `serializeTheme(theme)` / `deserializeTheme(json)` pair (currently the JSON IS the theme; this becomes useful when version-migration logic is needed).
- A `web/` PR that swaps the legacy inline `TABLETOP_THEME` / `NOIR_THEME` for `loadBundledThemes()` — but ONLY if the web foundation is already merged. Otherwise leave for the Phase 4 agent.

## Hand-off / merge

Open the PR with title `Themes: schema + bundled editions registry` referencing this plan file. Include in the PR body:
- A screenshot or rendered preview of each bundled theme (use a quick HTML preview script if helpful)
- Confirmation that `core/` and `services/` were not touched
- The full list of bundled theme ids
