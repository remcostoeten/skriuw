import { ThemePicker } from "../../settings/theme-picker";
import { CompactSidebarDemo, TreeGuidesDemo } from "./appearance-demos";
import {
  SettingToggle,
  SettingsHeading,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsSection,
  useEditableSettings,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

export function AppearanceSection({ store }: SectionProps) {
  const { settings, change } = useEditableSettings(store);

  return (
    <section aria-label="Appearance" className={settingsSection}>
      <SettingsHeading title="Appearance" detail="Choose how the workspace looks and behaves." />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Theme</div>
        <p className={settingsGroupHint}>Applied across the workspace.</p>
        <ThemePicker
          value={settings.theme}
          onSelect={(themeId) => change("theme", themeId)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Workspace</div>
        <SettingToggle
          label="Compact sidebar"
          detail="Use tighter spacing in the notes tree."
          checked={settings.compactSidebar}
          onChange={(checked) => change("compactSidebar", checked)}
          visualization={<CompactSidebarDemo enabled={settings.compactSidebar} />}
        />
        <SettingToggle
          label="Show tree guides"
          detail="Draw indent guides for nested notes and folders."
          checked={settings.showTreeGuides}
          onChange={(checked) => change("showTreeGuides", checked)}
          visualization={<TreeGuidesDemo enabled={settings.showTreeGuides} />}
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
        <SettingToggle
          label="Show toast notifications"
          detail="Show brief notices like “Moved to trash”. The undo shortcut keeps working while hidden."
          checked={settings.showToasts}
          onChange={(checked) => change("showToasts", checked)}
        />
      </div>
    </section>
  );
}
