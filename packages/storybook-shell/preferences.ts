import { createContext, useContext } from "react";

export type ColorScheme = "light" | "dark";
export type ColorMode = ColorScheme | "system";

export type StorybookTheme = {
  id: string;
  label: string;
  colorScheme: ColorScheme;
  /** CSS custom properties written to `<html>` while the theme is active; `"background"` and `"--background"` are equivalent. */
  tokens?: Readonly<Record<string, string>>;
};

export type StorybookToggle = {
  id: string;
  label: string;
  defaultValue: boolean;
};

export type StorybookPreferences = {
  /** The active theme, resolved from `colorMode` and `themeByScheme`. */
  theme: string;
  colorMode: ColorMode;
  /** The last theme picked for each scheme, restored when the mode switches back. */
  themeByScheme: Readonly<Partial<Record<ColorScheme, string>>>;
  sidebarCollapsed: boolean;
  toggles: Readonly<Record<string, boolean>>;
};

export type PreferencesStore = {
  subscribe: (listener: () => void) => () => void;
  get: () => StorybookPreferences;
  /** Merges `patch`; a `theme` also switches the mode to its scheme, unless `system` already resolves to it. */
  update: (patch: Partial<StorybookPreferences>) => void;
  resolvedScheme: () => ColorScheme;
};

type StoreOptions = {
  storageKey: string;
  themes: readonly StorybookTheme[];
  toggles: readonly StorybookToggle[];
  defaultColorMode: ColorMode;
  /** Class toggled on `<html>` in the dark scheme, for Tailwind's `dark:` variant; `false` to skip. */
  darkClass: string | false;
};

const DARK_QUERY = "(prefers-color-scheme: dark)";
const COLOR_MODES: readonly ColorMode[] = ["light", "dark", "system"];

function readStored(key: string): Partial<StorybookPreferences> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function systemScheme(): ColorScheme {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function tokenProperty(name: string): string {
  return name.startsWith("--") ? name : `--${name}`;
}

/**
 * Builds a light and a dark theme from two token maps, for apps that ship one palette per scheme.
 *
 * @example
 * themes={lightDarkThemes({ light: { background: "#fff", foreground: "#111" }, dark: { background: "#111", foreground: "#eee" } })}
 */
export function lightDarkThemes(
  tokens: Readonly<Record<ColorScheme, Readonly<Record<string, string>>>>,
  labels: Readonly<Record<ColorScheme, string>> = { light: "Light", dark: "Dark" },
): StorybookTheme[] {
  return (["light", "dark"] as const).map((scheme) => ({
    id: scheme,
    label: labels[scheme],
    colorScheme: scheme,
    tokens: tokens[scheme],
  }));
}

/**
 * Creates the persisted preference store behind the storybook chrome. The active theme is
 * mirrored to `<html data-theme data-color-scheme data-color-mode>`, its `tokens` to inline
 * custom properties and the dark scheme to `darkClass`. Everything is saved to `localStorage` under `storageKey`.
 */
export function createPreferencesStore({
  storageKey,
  themes,
  toggles,
  defaultColorMode,
  darkClass,
}: StoreOptions): PreferencesStore {
  const stored = readStored(storageKey);
  const storedToggles: Record<string, unknown> =
    typeof stored.toggles === "object" && stored.toggles !== null ? stored.toggles : {};
  const storedByScheme: Record<string, unknown> =
    typeof stored.themeByScheme === "object" && stored.themeByScheme !== null
      ? stored.themeByScheme
      : {};
  const storedTheme = themes.find((entry) => entry.id === stored.theme);
  function isThemeOf(id: unknown, scheme: ColorScheme): boolean {
    return themes.some((entry) => entry.id === id && entry.colorScheme === scheme);
  }
  function hasScheme(scheme: ColorScheme): boolean {
    return themes.some((entry) => entry.colorScheme === scheme);
  }

  function pickByScheme(scheme: ColorScheme): string | undefined {
    const remembered = storedByScheme[scheme];
    if (isThemeOf(remembered, scheme)) return remembered as string;
    if (storedTheme?.colorScheme === scheme) return storedTheme.id;
    return undefined;
  }

  function schemeOf(preferences: Pick<StorybookPreferences, "colorMode">): ColorScheme {
    const wanted = preferences.colorMode === "system" ? systemScheme() : preferences.colorMode;
    return hasScheme(wanted) ? wanted : (themes[0]?.colorScheme ?? wanted);
  }

  function resolveTheme(preferences: StorybookPreferences, scheme: ColorScheme): string {
    const remembered = preferences.themeByScheme[scheme];
    if (isThemeOf(remembered, scheme)) return remembered!;
    return themes.find((entry) => entry.colorScheme === scheme)?.id ?? themes[0]?.id ?? "";
  }

  let appliedTokens: readonly string[] = [];

  function applyToRoot() {
    const root = document.documentElement;
    const theme = themes.find((entry) => entry.id === current.theme);
    for (const property of appliedTokens) root.style.removeProperty(property);
    appliedTokens = [];
    root.dataset.colorMode = current.colorMode;
    if (theme) {
      root.dataset.theme = theme.id;
      root.dataset.colorScheme = theme.colorScheme;
      root.style.colorScheme = theme.colorScheme;
      if (darkClass) root.classList.toggle(darkClass, theme.colorScheme === "dark");
      appliedTokens = Object.entries(theme.tokens ?? {}).map(([name, value]) => {
        const property = tokenProperty(name);
        root.style.setProperty(property, value);
        return property;
      });
    }
  }

  let current: StorybookPreferences = {
    theme: "",
    colorMode: COLOR_MODES.includes(stored.colorMode!)
      ? stored.colorMode!
      : (storedTheme?.colorScheme ?? defaultColorMode),
    themeByScheme: { light: pickByScheme("light"), dark: pickByScheme("dark") },
    sidebarCollapsed: stored.sidebarCollapsed === true,
    toggles: Object.fromEntries(
      toggles.map((toggle) => {
        const value = storedToggles[toggle.id];
        return [toggle.id, typeof value === "boolean" ? value : toggle.defaultValue];
      }),
    ),
  };
  current = { ...current, theme: resolveTheme(current, schemeOf(current)) };
  const listeners = new Set<() => void>();
  applyToRoot();

  function commit(next: StorybookPreferences) {
    current = { ...next, theme: resolveTheme(next, schemeOf(next)) };
    applyToRoot();
    try {
      localStorage.setItem(storageKey, JSON.stringify(current));
    } catch (error) {
      console.warn("Storybook preferences were not saved", error);
    }
    for (const listener of listeners) listener();
  }

  if (typeof matchMedia === "function") {
    matchMedia(DARK_QUERY).addEventListener("change", () => {
      if (current.colorMode === "system") commit(current);
    });
  }

  function themeSelection(id: string) {
    const theme = themes.find((entry) => entry.id === id);
    if (!theme) return;
    const keepsSystem = current.colorMode === "system" && systemScheme() === theme.colorScheme;
    return {
      colorMode: keepsSystem ? ("system" as const) : theme.colorScheme,
      themeByScheme: { ...current.themeByScheme, [theme.colorScheme]: theme.id },
    };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => current,
    resolvedScheme: () => schemeOf(current),
    update({ theme, ...patch }) {
      const selected = theme === undefined ? undefined : themeSelection(theme);
      commit({
        ...current,
        ...patch,
        ...selected,
        themeByScheme: {
          ...current.themeByScheme,
          ...selected?.themeByScheme,
          ...patch.themeByScheme,
        },
        toggles: { ...current.toggles, ...patch.toggles },
      });
    },
  };
}

export const PreferencesContext = createContext<PreferencesStore | null>(null);

/** Returns the store of the surrounding `<Storybook>`; throws outside one. */
export function usePreferencesStore(): PreferencesStore {
  const store = useContext(PreferencesContext);
  if (!store) throw new Error("usePreferencesStore must be used inside <Storybook>");
  return store;
}
