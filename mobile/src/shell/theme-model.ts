import {
  DARK_THEMES,
  THEME_NAMES,
  THEME_TOKENS,
  type ThemeName,
  type ThemeTokens,
} from "../../../shared/theme/tokens";

export type ColorScheme = "light" | "dark";

/** A chosen theme, or the platform's own light/dark setting. */
export type ThemePreference = "system" | ThemeName;

export const SYSTEM_THEMES: Record<ColorScheme, ThemeName> = {
  dark: "midnight",
  light: "paper",
};

export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value);
}

export function themePreferenceFromSettings(theme: string): ThemePreference {
  return isThemeName(theme) ? theme : "system";
}

export function resolveThemeName(
  preference: ThemePreference,
  scheme: ColorScheme,
): ThemeName {
  return preference === "system" ? SYSTEM_THEMES[scheme] : preference;
}

export function themeIsDark(name: ThemeName): boolean {
  return DARK_THEMES[name];
}

export function themeTokens(name: ThemeName): ThemeTokens {
  return THEME_TOKENS[name];
}

/**
 * The same colour at a given opacity. Generated tokens are `hsl(h, s%, l%)`
 * triples, which React Native cannot fade on its own, so the alpha is folded
 * into the colour the way `hsl(var(--token) / 0.55)` does on the web.
 */
export function withAlpha(color: string, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const opened = color.indexOf("(");
  if (!color.startsWith("hsl(") || !color.endsWith(")")) {
    return color;
  }
  const channels = color.slice(opened + 1, -1).trim();
  return `hsla(${channels}, ${clamped})`;
}

export type ThemeOption = {
  name: ThemeName;
  label: string;
  dark: boolean;
};

function titleCase(name: string): string {
  return name
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/** Every generated theme, in generator order, for the appearance picker. */
export const THEME_OPTIONS: readonly ThemeOption[] = THEME_NAMES.map((name) => ({
  name,
  label: titleCase(name),
  dark: DARK_THEMES[name],
}));
