import {
  THEME_NAMES,
  THEME_TOKENS,
  TOKEN_NAMES,
  type ThemeName,
  type ThemeTokens,
  type TokenName,
} from "./tokens";
import {
  BUILTIN_THEMES,
  type BuiltinThemeMetadata,
  type ThemeColorScheme,
} from "./metadata";

export { BUILTIN_THEMES } from "./metadata";
export type { BuiltinThemeMetadata, ThemeColorScheme, ThemeFamily } from "./metadata";

export const THEME_SCHEMA_VERSION = 1;
export const DEFAULT_THEME_ID: ThemeName = "midnight";

export type ThemeDefinition = {
  schemaVersion: typeof THEME_SCHEMA_VERSION;
  id: string;
  label: string;
  colorScheme: ThemeColorScheme;
  tokens: ThemeTokens;
};

export type ResolvedTheme = ThemeDefinition & {
  source: "builtin" | "custom";
};

export type CustomThemeRegistry = {
  get: (id: string) => ThemeDefinition | undefined;
  subscribe?: (listener: () => void) => () => void;
};

export class InMemoryCustomThemeRegistry implements CustomThemeRegistry {
  readonly #themes = new Map<string, ThemeDefinition>();
  readonly #listeners = new Set<() => void>();

  get(id: string): ThemeDefinition | undefined {
    return this.#themes.get(id);
  }

  set(theme: ThemeDefinition): void {
    const error = validateThemeDefinition(theme);
    if (error) throw new Error(error);
    this.#themes.set(theme.id, theme);
    for (const listener of this.#listeners) listener();
  }

  delete(id: string): void {
    if (!this.#themes.delete(id)) return;
    for (const listener of this.#listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HSL_COLOR_PATTERN = /^hsl\(-?[\d.]+,\s*[\d.]+%,\s*[\d.]+%\)$/;
const BUILTIN_BY_ID = new Map(BUILTIN_THEMES.map((theme) => [theme.id, theme]));

export function isBuiltinThemeId(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value);
}

export function builtinThemeLabel(theme: BuiltinThemeMetadata): string {
  return theme.family ? `${theme.family.label} ${theme.label}` : theme.label;
}

export function validateThemeDefinition(theme: ThemeDefinition): string | null {
  if (theme.schemaVersion !== THEME_SCHEMA_VERSION) return "unsupported theme schema version";
  if (!THEME_ID_PATTERN.test(theme.id)) return "invalid theme id";
  if (theme.label.trim() === "" || theme.label.length > 80) return "invalid theme label";
  const actual = Object.keys(theme.tokens);
  if (actual.length !== TOKEN_NAMES.length) return "theme token set is incomplete";
  for (const token of TOKEN_NAMES) {
    if (!HSL_COLOR_PATTERN.test(theme.tokens[token])) return `invalid --${token} color`;
  }
  return null;
}

export function resolveTheme(
  id: string,
  customThemes?: CustomThemeRegistry,
): ResolvedTheme {
  if (isBuiltinThemeId(id)) {
    return resolveBuiltinTheme(id);
  }
  const custom = customThemes?.get(id);
  if (custom && validateThemeDefinition(custom) === null) {
    return { ...custom, source: "custom" };
  }
  return resolveBuiltinTheme(DEFAULT_THEME_ID);
}

export function themeTokenChannels(color: string): string | null {
  const match = /^hsl\((.*)\)$/.exec(color.trim());
  return match?.[1]?.replaceAll(",", "").trim() ?? null;
}

export function themeTokensEqual(left: ThemeTokens, right: ThemeTokens): boolean {
  return TOKEN_NAMES.every((token: TokenName) => left[token] === right[token]);
}

function resolveBuiltinTheme(id: ThemeName): ResolvedTheme {
  const metadata = BUILTIN_BY_ID.get(id);
  if (!metadata) throw new Error(`missing built-in theme metadata for ${id}`);
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    id,
    label: builtinThemeLabel(metadata),
    colorScheme: metadata.colorScheme,
    tokens: THEME_TOKENS[id],
    source: "builtin",
  };
}
