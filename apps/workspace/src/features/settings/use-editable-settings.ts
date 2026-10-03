import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { updateSetting } from "@/features/settings/update-settings";
import { projectSettings } from "./settings-model";
import type { EditableSettings, SettingsViewModel } from "./settings-model";
import { selectSettings } from "./selectors";

type EditableSettingsBinding = {
  settings: SettingsViewModel;
  change: <K extends keyof EditableSettings>(field: K, value: EditableSettings[K]) => void;
};

/** Subscribes a settings section to the settings document and exposes a typed field updater. */
export function useEditableSettings(store: RendererStore): EditableSettingsBinding {
  const document = useRendererSelector(store, selectSettings);
  const settings = projectSettings(document);
  function change<K extends keyof EditableSettings>(field: K, value: EditableSettings[K]): void {
    updateSetting(store, field, value);
  }
  return { settings, change };
}
