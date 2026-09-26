import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  TOKEN_NAMES,
  resolveTheme,
  themeTokenChannels,
  type CustomThemeRegistry,
  type ThemeColorScheme,
  type ThemeTokens,
} from "@skriuw/theme";
import { writeBootAppearance } from "./boot-appearance";

export type RootSettingsAttributes = {
  theme: string;
  colorScheme: ThemeColorScheme;
  tokens?: ThemeTokens;
};

type RootElement = {
  dataset: { theme?: string; colorScheme?: string };
  style: {
    setProperty: (property: string, value: string) => void;
    removeProperty: (property: string) => void;
  };
};

/**
 * Projects the persisted settings document onto the document-level attributes
 * consumed by CSS: `data-theme` and `data-color-scheme` for the palette.
 */
export function rootSettingsAttributes(
  settings: WorkspaceSettings,
  customThemes?: CustomThemeRegistry,
): RootSettingsAttributes {
  const theme = resolveTheme(settings.theme, customThemes);
  return {
    theme: theme.id,
    colorScheme: theme.colorScheme,
    ...(theme.source === "custom" ? { tokens: theme.tokens } : {}),
  };
}

export function applySettingsToRoot(
  root: RootElement,
  settings: WorkspaceSettings,
  customThemes?: CustomThemeRegistry,
): void {
  applyAttributesToRoot(root, rootSettingsAttributes(settings, customThemes));
}

export function applyAttributesToRoot(root: RootElement, attributes: RootSettingsAttributes): void {
  for (const token of TOKEN_NAMES) {
    root.style.removeProperty(`--${token}`);
  }
  if (attributes.tokens) {
    for (const token of TOKEN_NAMES) {
      const channels = themeTokenChannels(attributes.tokens[token]);
      if (channels) root.style.setProperty(`--${token}`, channels);
    }
  }
  root.dataset.theme = attributes.theme;
  root.dataset.colorScheme = attributes.colorScheme;
}

/**
 * Applies the current settings to the root element and keeps them applied
 * across settings changes. Returns the store unsubscribe function.
 */
export function bindSettingsToRoot(
  store: RendererStore,
  root: RootElement,
  customThemes?: CustomThemeRegistry,
): () => void {
  function apply(): void {
    const settings = store.getState().settings;
    applySettingsToRoot(root, settings, customThemes);
    const storage = globalThis.localStorage;
    if (storage) {
      writeBootAppearance(storage, rootSettingsAttributes(settings, customThemes));
    }
  }
  apply();
  const unsubscribeSettings = store.subscribe((state) => state.settings.theme, apply);
  const unsubscribeThemes = customThemes?.subscribe?.(apply) ?? (() => {});
  return () => {
    unsubscribeSettings();
    unsubscribeThemes();
  };
}

/**
 * Escapes arbitrary text into a double-quoted CSS string literal, suitable
 * for `content: var(--...)` custom-property values.
 */
export function cssStringLiteral(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}
