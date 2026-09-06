import { showsToasts, usesAnimatedIcons } from "@/features/settings/settings-model";
import { shortcutOverridesFromSettings } from "@/commands/bindings";
import type { ShortcutOverrides } from "@/commands/bindings";
import type { RendererState } from "@/store/types";

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

export function selectAnimatedIcons(state: RendererState): boolean {
  return usesAnimatedIcons(state.settings);
}

export function selectReduceMotion(state: RendererState): boolean {
  return state.settings.reduceMotion === true;
}

export function selectEditorPlaceholder(state: RendererState): string {
  return state.settings.editorPlaceholder;
}

export function selectTheme(state: RendererState): string {
  return state.settings.theme;
}
