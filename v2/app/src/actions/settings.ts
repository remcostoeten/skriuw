import type { WorkspaceSettings } from "../contracts/workspace";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  changeSetting,
  changeShortcutOverride,
  resetShortcutOverride,
  resetShortcutOverrides,
} from "../settings/settings-model";
import type { EditableSettings } from "../settings/settings-model";
import { SHORTCUT_DEFINITIONS } from "../shortcuts/definitions";
import type { ShortcutActionId } from "../shortcuts/definitions";
import type { RendererStore } from "../store/types";
import { commitOperations } from "./workspace";

const LIFECYCLE_SETTING_KEYS = [
  "onboardingVersion",
  "starterSeedVersion",
  "starterSeedNoteIds",
  "starterSeedAt",
] as const;

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

/**
 * First-run bookkeeping is workspace lifecycle, not a preference, so resetting
 * preferences must not replay onboarding or re-seed the preview notes.
 */
export function resetAllSettings(store: RendererStore): void {
  const current = store.getState().settings;
  updateSettings(store, {
    ...DEFAULT_WORKSPACE_SETTINGS,
    ...preservedLifecycle(current),
  });
}

function preservedLifecycle(settings: WorkspaceSettings): Partial<WorkspaceSettings> {
  const preserved: Record<string, unknown> = {};
  for (const key of LIFECYCLE_SETTING_KEYS) {
    if (settings[key] !== undefined) {
      preserved[key] = settings[key];
    }
  }
  return preserved;
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
