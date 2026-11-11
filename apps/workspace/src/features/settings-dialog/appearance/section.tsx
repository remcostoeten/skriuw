import { settingsCopy } from "@/shared/ui/settings-copy";
import { useState } from "react";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { ThemePicker } from "@/features/settings-dialog/appearance/theme-picker";
import { resetAllSettings } from "../reset-settings";
import { Button } from "@/shared/ui/button";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { Dialog } from "@/shared/ui/dialog";
import { PalettePreview, SidebarTreePreview } from "./demos";
import { PALETTE_DENSITY_OPTIONS, PALETTE_SIZE_OPTIONS } from "@/commands/palette-options";
import { changedPreferenceCount } from "@/features/settings/settings-model";
import {
  SettingSegmented,
  SettingToggle,
  SettingsGroup,
  SettingsRow,
  settingsSection,
} from "@/shared/ui/settings-controls";
import { useEditableSettings } from "@/features/settings/use-editable-settings";
import type { SectionProps } from "@/features/settings-dialog/sections";

const BROWSER_RUNTIME = isBrowserRuntime();

export function AppearanceSection({ store }: SectionProps) {
  const { settings, change, changed } = useEditableSettings(store);
  const [confirmDisableAi, setConfirmDisableAi] = useState(false);
  const changedCount = changedPreferenceCount(settings);

  function changeAiEnabled(enabled: boolean): void {
    if (enabled) {
      change("aiEnabled", true);
      return;
    }
    setConfirmDisableAi(true);
  }

  function disableAi(): void {
    change("aiEnabled", false);
    setConfirmDisableAi(false);
  }

  return (
    <section aria-label="General preferences" className={settingsSection}>
      <SettingsGroup
        id="theme"
        title="Theme"
        hint={settingsCopy.appearance.appliedAcrossTheWorkspace}
        keywords="appearance color midnight paper embers mocha latte catppuccin rose pine dusk dawn gruvbox tokyo night day dark light"
      >
        <SettingsRow label="Color theme" stack hideLabel>
          <ThemePicker value={settings.theme} onSelect={(themeId) => change("theme", themeId)} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup
        id="sidebar"
        title="Sidebar"
        preview={
          <SidebarTreePreview compact={settings.compactSidebar} guides={settings.showTreeGuides} />
        }
      >
        <SettingToggle
          label="Compact sidebar"
          detail={settingsCopy.appearance.useTighterSpacingInTheNotes}
          checked={settings.compactSidebar}
          changed={changed("compactSidebar")}
          onChange={(checked) => change("compactSidebar", checked)}
        />
        <SettingToggle
          label={settingsCopy.appearance.showTreeGuides}
          detail={settingsCopy.appearance.drawIndentGuidesForNestedNotes}
          checked={settings.showTreeGuides}
          changed={changed("showTreeGuides")}
          onChange={(checked) => change("showTreeGuides", checked)}
        />
      </SettingsGroup>
      <SettingsGroup
        id="palette"
        title="Command palette"
        preview={<PalettePreview density={settings.paletteDensity} size={settings.paletteSize} />}
        keywords="size roomy large spacious density"
      >
        <SettingSegmented
          label="Row density"
          detail={settingsCopy.appearance.howMuchSpaceEachResultIn}
          value={settings.paletteDensity}
          options={PALETTE_DENSITY_OPTIONS}
          changed={changed("paletteDensity")}
          onChange={(value) => change("paletteDensity", value)}
        />
        <SettingSegmented
          label={settingsCopy.appearance.commandPaletteSize}
          detail={settingsCopy.appearance.howTallAndWideTheCommand}
          value={settings.paletteSize}
          options={PALETTE_SIZE_OPTIONS}
          changed={changed("paletteSize")}
          onChange={(value) => change("paletteSize", value)}
        />
      </SettingsGroup>
      <SettingsGroup
        id="workspace"
        title="Workspace"
        keywords="startup notifications toasts accessibility animation hover"
      >
        <SettingToggle
          label={settingsCopy.appearance.rememberLastNote}
          detail={settingsCopy.appearance.returnToTheLastOpenNote}
          checked={settings.rememberLastNote}
          changed={changed("rememberLastNote")}
          onChange={(checked) => change("rememberLastNote", checked)}
        />
        <SettingToggle
          label={settingsCopy.appearance.showToastNotifications}
          detail={settingsCopy.appearance.showBriefNoticesLikeMovedTo}
          checked={settings.showToasts}
          changed={changed("showToasts")}
          onChange={(checked) => change("showToasts", checked)}
        />
        <SettingToggle
          label="Animated icons"
          detail={settingsCopy.appearance.playABriefAnimationWhenThe}
          checked={settings.animatedIcons}
          changed={changed("animatedIcons")}
          onChange={(checked) => change("animatedIcons", checked)}
        />
      </SettingsGroup>
      {!BROWSER_RUNTIME && (
        <SettingsGroup id="optional" title="Optional features">
          <SettingToggle
            label="AI features"
            detail={settingsCopy.appearance.addAiProviderSettingsAndWriting}
            checked={settings.aiEnabled}
            changed={changed("aiEnabled")}
            onChange={changeAiEnabled}
          />
        </SettingsGroup>
      )}
      <SettingsGroup
        id="preferences"
        title="Preferences"
        hint={
          changedCount === 0
            ? "Every preference uses its default."
            : `${changedCount} ${changedCount === 1 ? "preference differs" : "preferences differ"} from the defaults.`
        }
        keywords="reset defaults advanced"
      >
        <SettingsRow
          label="Reset preferences"
          detail={settingsCopy.appearance.restoresAppearanceEditorAndKeyboardShortcuts}
        >
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
        </SettingsRow>
      </SettingsGroup>
      <Dialog
        open={confirmDisableAi}
        onOpenChange={setConfirmDisableAi}
        title={settingsCopy.appearance.turnOffAiFeatures}
        className="w-[min(440px,calc(100vw-24px))]"
      >
        <div className="space-y-4 px-4 py-4 text-sm leading-6 text-muted-foreground">
          <p className="m-0">{settingsCopy.appearance.aiToolsAndSettingsWillDisappear}</p>
          <p className="m-0">{settingsCopy.appearance.savedProviderKeysHistoryAndPrompts}</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={() => setConfirmDisableAi(false)}>Keep enabled</Button>
            <Button variant="dangerFilled" onClick={disableAi}>
              {settingsCopy.appearance.turnOffAi}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
