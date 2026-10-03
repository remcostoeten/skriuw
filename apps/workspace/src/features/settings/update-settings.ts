import {
  changeSetting,
  changeShortcutOverride,
  resetShortcutOverride,
  resetShortcutOverrides,
} from "./settings-model";
import type { EditableSettings } from "./settings-model";
import { changeQuitShortcutEnabled } from "@/commands/bindings";
import { SHORTCUT_DEFINITIONS } from "@/commands/definitions";
import type { ShortcutActionId } from "@/commands/definitions";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { updateSettings } from "@/store/settings";

export function updateSetting<K extends keyof EditableSettings>(
  store: RendererStore,
  field: K,
  value: EditableSettings[K],
): void {
  updateSettings(store, changeSetting(store.getState().settings, field, value));
}

export function setQuitShortcutEnabled(store: RendererStore, enabled: boolean): void {
  updateSettings(store, changeQuitShortcutEnabled(store.getState().settings, enabled));
}

export function setShortcutOverride(
  store: RendererStore,
  actionId: ShortcutActionId,
  combo: string,
): void {
  updateSettings(store, changeShortcutOverride(store.getState().settings, actionId, combo));
}

export function clearAllShortcutOverrides(store: RendererStore): void {
  const current = store.getState().settings;
  const settings = resetShortcutOverrides(
    current,
    SHORTCUT_DEFINITIONS.map((definition) => definition.id),
  );
  if (settings === current) {
    return;
  }
  updateSettings(store, settings);
}

export function clearShortcutOverride(store: RendererStore, actionId: ShortcutActionId): void {
  const current = store.getState().settings;
  const settings = resetShortcutOverride(current, actionId);
  if (settings === current) {
    return;
  }
  updateSettings(store, settings);
}
