import type { WorkspaceSettings } from "../contracts/workspace";
import { shortcutOverridesFromSettings } from "../shortcuts/bindings";
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
  patch: Partial<WorkspaceSettings>,
): void {
  const settings = { ...store.getState().settings, ...patch };
  void commitOperations(store, [{ type: "update_settings", settings }]).catch(
    reportRejection("update settings"),
  );
}

export function setShortcutOverride(
  store: RendererStore,
  actionId: ShortcutActionId,
  combo: string,
): void {
  const overrides = shortcutOverridesFromSettings(store.getState().settings);
  updateSettings(store, { shortcutOverrides: { ...overrides, [actionId]: combo } });
}

export function clearShortcutOverride(
  store: RendererStore,
  actionId: ShortcutActionId,
): void {
  const overrides = shortcutOverridesFromSettings(store.getState().settings);
  if (!(actionId in overrides)) {
    return;
  }
  const { [actionId]: _removed, ...rest } = overrides;
  updateSettings(store, { shortcutOverrides: rest });
}
