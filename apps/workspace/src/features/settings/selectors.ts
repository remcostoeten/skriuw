import {
  showsToasts,
  usesAnimatedIcons,
  usesBlockDragHandle,
  usesFacehashAvatar,
} from "@/features/settings/settings-model";
import { quitShortcutEnabled, storedShortcutOverrides } from "@/commands/bindings";
import type { ShortcutOverrides } from "@/commands/bindings";
import type { RendererState } from "@skriuw/renderer-core/store/types";

export function selectStoredShortcutOverrides(state: RendererState): ShortcutOverrides {
  return storedShortcutOverrides(state.settings);
}

export function selectQuitShortcutEnabled(state: RendererState): boolean {
  return quitShortcutEnabled(state.settings);
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

export function selectFacehashAvatar(state: RendererState): boolean {
  return usesFacehashAvatar(state.settings);
}

export function selectBlockDragHandle(state: RendererState): boolean {
  return usesBlockDragHandle(state.settings);
}

export function selectEditorPlaceholder(state: RendererState): string {
  return state.settings.editorPlaceholder;
}

export function selectTheme(state: RendererState): string {
  return state.settings.theme;
}
