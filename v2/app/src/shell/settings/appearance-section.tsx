import { updateSetting } from "../../actions/settings";
import { projectSettings } from "../../settings/settings-model";
import type { EditableSettings } from "../../settings/settings-model";
import { ThemePicker } from "../../settings/theme-picker";
import { useRendererSelector } from "../../store/use-renderer-selector";
import { selectSettings } from "./selectors";
import { SettingToggle } from "./settings-shared";
import type { SectionProps } from "./settings-shared";

export function AppearanceSection({ store }: SectionProps) {
  const document = useRendererSelector(store, selectSettings);
  const settings = projectSettings(document);

  function change<K extends keyof EditableSettings>(
    field: K,
    value: EditableSettings[K],
  ): void {
    updateSetting(store, field, value);
  }

  return (
    <section aria-label="Appearance">
      <div className="settings-section-heading">
        <h1>Appearance</h1>
        <p>Choose how the workspace looks and behaves.</p>
      </div>
      <div className="settings-group settings-theme-group">
        <div className="settings-group-title">Theme</div>
        <p className="settings-group-hint">Applied across the workspace.</p>
        <ThemePicker
          value={settings.theme}
          onSelect={(themeId) => change("theme", themeId)}
        />
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Workspace</div>
        <SettingToggle
          label="Compact sidebar"
          detail="Use tighter spacing in the notes tree."
          checked={settings.compactSidebar}
          onChange={(checked) => change("compactSidebar", checked)}
        />
        <SettingToggle
          label="Show tree guides"
          detail="Draw indent guides for nested notes and folders."
          checked={settings.showTreeGuides}
          onChange={(checked) => change("showTreeGuides", checked)}
        />
        <SettingToggle
          label="Reduce motion"
          detail="Minimize non-essential interface motion."
          checked={settings.reduceMotion}
          onChange={(checked) => change("reduceMotion", checked)}
        />
        <SettingToggle
          label="Remember last note"
          detail="Return to the last open note when the workspace starts."
          checked={settings.rememberLastNote}
          onChange={(checked) => change("rememberLastNote", checked)}
        />
      </div>
    </section>
  );
}
