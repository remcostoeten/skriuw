import { showsToasts } from "../../settings/settings-model";
import { shortcutOverridesFromSettings } from "../../shortcuts/bindings";
import type { ShortcutOverrides } from "../../shortcuts/bindings";
import type { RendererState } from "../../store/types";

export function selectShortcutOverrides(state: RendererState): ShortcutOverrides {
  return shortcutOverridesFromSettings(state.settings);
}

export function sameOverrides(left: ShortcutOverrides, right: ShortcutOverrides): boolean {
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key as keyof ShortcutOverrides] === right[key as keyof ShortcutOverrides])
  );
}

export function selectSettings(state: RendererState) {
  return state.settings;
}

export function selectShowToasts(state: RendererState): boolean {
  return showsToasts(state.settings);
}

export function selectTheme(state: RendererState): string {
  return state.settings.theme;
}
