import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import type { ThemeName, ThemeTokens, TokenName } from "../../../shared/theme/tokens";
import {
  resolveThemeName,
  themeIsDark,
  themeTokens,
  withAlpha,
  type ColorScheme,
  type ThemePreference,
} from "./theme-model";

export type ShellTheme = {
  name: ThemeName;
  tokens: ThemeTokens;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** A generated token, optionally faded, as a React Native colour. */
  color: (token: TokenName, alpha?: number) => string;
};

const ThemeContext = createContext<ShellTheme | null>(null);

type Props = {
  children: ReactNode;
  initialPreference?: ThemePreference;
};

/**
 * Every colour in the shell comes from the generated token map
 * (`shared/theme/tokens.ts`, R-A5). The preference resolves against the
 * platform's own light/dark setting until someone picks a theme by hand.
 */
export function ThemeProvider({ children, initialPreference = "system" }: Props) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const scheme: ColorScheme = useColorScheme() === "light" ? "light" : "dark";
  const name = resolveThemeName(preference, scheme);
  const tokens = themeTokens(name);
  const color = useCallback(
    (token: TokenName, alpha?: number) =>
      alpha === undefined ? tokens[token] : withAlpha(tokens[token], alpha),
    [tokens],
  );
  const value = useMemo<ShellTheme>(
    () => ({
      name,
      tokens,
      isDark: themeIsDark(name),
      preference,
      setPreference,
      color,
    }),
    [color, name, preference, tokens],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ShellTheme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme was called outside ThemeProvider");
  }
  return theme;
}
