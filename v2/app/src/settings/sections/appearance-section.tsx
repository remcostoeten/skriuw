import { ThemePicker } from "@/settings/theme-picker";
import { resetAllSettings } from "@/store/actions/settings";
import { Button } from "@/shared/ui/button";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
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
    <section aria-label="General preferences" className={settingsSection}>
      <SettingsHeading title="General" detail="Choose how the workspace looks and behaves." />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Theme</div>
        <p className={settingsGroupHint}>Applied across the workspace.</p>
        <ThemePicker
          value={settings.theme}
          onSelect={(themeId) => change("theme", themeId)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Sidebar</div>
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
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Accessibility</div>
        <SettingToggle
          label="Reduce motion"
          detail="Minimize non-essential interface motion."
          checked={settings.reduceMotion}
          onChange={(checked) => change("reduceMotion", checked)}
        />
        <SettingToggle
          label="Animated icons"
          detail="Play a brief animation when the pointer rests on a rail or toolbar icon."
          checked={settings.animatedIcons}
          onChange={(checked) => change("animatedIcons", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Startup</div>
        <SettingToggle
          label="Remember last note"
          detail="Return to the last open note when the workspace starts."
          checked={settings.rememberLastNote}
          onChange={(checked) => change("rememberLastNote", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Notifications</div>
        <SettingToggle
          label="Show toast notifications"
          detail="Show brief notices like “Moved to trash”. The undo shortcut keeps working while hidden."
          checked={settings.showToasts}
          onChange={(checked) => change("showToasts", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Preferences</div>
        <div className="flex min-h-[42px] items-center justify-between gap-3 py-[7px] text-[13px]">
          <span className="flex min-w-0 flex-col gap-[3px]">
            Reset preferences
            <span className="text-[11px] leading-[1.35] text-muted-foreground">
              Restores appearance, editor, and keyboard shortcuts to their defaults.
              Notes and workspace data are not affected.
            </span>
          </span>
          <InlineConfirm
            className="shrink-0"
            confirmLabel="Reset preferences"
            onConfirm={() => resetAllSettings(store)}
            renderIdle={(arm) => (
              <Button variant="danger" onClick={arm}>
                Reset preferences
              </Button>
            )}
          />
        </div>
      </div>
    </section>
  );
}
