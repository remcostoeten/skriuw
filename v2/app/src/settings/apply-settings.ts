import type { WorkspaceSettings } from "../contracts/workspace";
import type { RendererStore } from "../store/types";
import { writeBootAppearance } from "./boot-appearance";
import { projectSettings } from "./settings-model";

export type RootSettingsAttributes = {
  theme: string;
  reduceMotion: boolean;
};

type RootElement = {
  dataset: { theme?: string; reduceMotion?: string };
};

/**
 * Projects the persisted settings document onto the document-level attributes
 * consumed by CSS: `data-theme` for the palette and `data-reduce-motion` for
 * the motion overrides.
 */
export function rootSettingsAttributes(
  settings: WorkspaceSettings,
): RootSettingsAttributes {
  const projected = projectSettings(settings);
  return { theme: projected.theme, reduceMotion: projected.reduceMotion };
}

export function applySettingsToRoot(
  root: RootElement,
  settings: WorkspaceSettings,
): void {
  const attributes = rootSettingsAttributes(settings);
  root.dataset.theme = attributes.theme;
  if (attributes.reduceMotion) {
    root.dataset.reduceMotion = "true";
  } else {
    delete root.dataset.reduceMotion;
  }
}

/**
 * Applies the current settings to the root element and keeps them applied
 * across settings changes. Returns the store unsubscribe function.
 */
export function bindSettingsToRoot(
  store: RendererStore,
  root: RootElement,
): () => void {
  function apply(): void {
    const settings = store.getState().settings;
    applySettingsToRoot(root, settings);
    const storage = globalThis.localStorage;
    if (storage) {
      writeBootAppearance(storage, rootSettingsAttributes(settings));
    }
  }
  apply();
  return store.subscribe((state) => state.settings, apply);
}

/**
 * Escapes arbitrary text into a double-quoted CSS string literal, suitable
 * for `content: var(--...)` custom-property values.
 */
export function cssStringLiteral(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}
