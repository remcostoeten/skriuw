import type { WorkspaceSettings } from "../contracts/workspace";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  changeSetting,
  changeShortcutOverride,
  resetShortcutOverride,
} from "../settings/settings-model";
import type { EditableSettings } from "../settings/settings-model";
import type { ShortcutActionId } from "../shortcuts/definitions";
import type { RendererStore } from "../store/types";
import { commitOperations } from "./workspace";

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}

export function updateSettings(
  store: RendererStore,
  settings: WorkspaceSettings,
): void {
  void commitOperations(store, [{ type: "update_settings", settings }]).catch(
    reportRejection("update settings"),
  );
}

export function updateSetting<K extends keyof EditableSettings>(
  store: RendererStore,
  field: K,
  value: EditableSettings[K],
): void {
  updateSettings(store, changeSetting(store.getState().settings, field, value));
}

export function setShortcutOverride(
  store: RendererStore,
  actionId: ShortcutActionId,
  combo: string,
): void {
  updateSettings(
    store,
    changeShortcutOverride(store.getState().settings, actionId, combo),
  );
}

export function resetAllSettings(store: RendererStore): void {
  updateSettings(store, { ...DEFAULT_WORKSPACE_SETTINGS });
}

export function clearShortcutOverride(
  store: RendererStore,
  actionId: ShortcutActionId,
): void {
  const current = store.getState().settings;
  const settings = resetShortcutOverride(current, actionId);
  if (settings === current) {
    return;
  }
  updateSettings(store, settings);
}
