import { settingsCopy } from "@/shared/ui/settings-copy";
import { useState } from "react";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { ThemePicker } from "@/features/settings-dialog/appearance/theme-picker";
import { resetAllSettings } from "../reset-settings";
import { Button } from "@/shared/ui/button";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { Dialog } from "@/shared/ui/dialog";
import { CompactSidebarDemo, TreeGuidesDemo } from "./demos";
import {
  PALETTE_DENSITY_OPTIONS,
  PALETTE_SIZE_OPTIONS,
  type PaletteDensity,
  type PaletteSize,
} from "@/features/settings/settings-model";
import {
  SettingCardPicker,
  SettingToggle,
  SettingsHeading,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
} from "@/shared/ui/settings-controls";
import { useEditableSettings } from "@/features/settings/use-editable-settings";
import type { SectionProps } from "@/features/settings-dialog/sections";

const BROWSER_RUNTIME = isBrowserRuntime();

const PALETTE_ROW_GAP: Record<PaletteDensity, string> = {
  compact: "gap-0.5",
  normal: "gap-1.5",
  spacious: "gap-2.5",
};

const PALETTE_DENSITY_PICKER_OPTIONS = PALETTE_DENSITY_OPTIONS.map((option) => ({
  ...option,
  preview: <PaletteDensityPreview density={option.value} />,
}));

const PALETTE_PREVIEW_SIZE: Record<PaletteSize, string> = {
  default: "h-5 w-9",
  roomy: "h-6 w-11",
  large: "h-7 w-[3.25rem]",
};

const PALETTE_SIZE_PICKER_OPTIONS = PALETTE_SIZE_OPTIONS.map((option) => ({
  ...option,
  preview: <PaletteSizePreview size={option.value} />,
}));

function PaletteSizePreview({ size }: { size: PaletteSize }) {
  return (
    <span className="flex h-7 w-[3.25rem] items-start justify-center" aria-hidden="true">
      <span
        className={`flex flex-col gap-1 rounded-sm border border-foreground/40 p-1 ${PALETTE_PREVIEW_SIZE[size]}`}
      >
        <span className="h-0.5 rounded-full bg-foreground/60" />
        <span className="h-0.5 w-3/4 rounded-full bg-foreground/35" />
      </span>
    </span>
  );
}

function PaletteDensityPreview({ density }: { density: PaletteDensity }) {
  return (
    <span className={`flex w-12 flex-col ${PALETTE_ROW_GAP[density]}`} aria-hidden="true">
      <span className="h-1 rounded-full bg-foreground/60" />
      <span className="h-1 w-4/5 rounded-full bg-foreground/35" />
      <span className="h-1 w-3/5 rounded-full bg-foreground/35" />
    </span>
  );
}

export function AppearanceSection({ store }: SectionProps) {
  const { settings, change } = useEditableSettings(store);
  const [confirmDisableAi, setConfirmDisableAi] = useState(false);

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
      <SettingsHeading
        title="General"
        detail={settingsCopy.appearance.chooseHowTheWorkspaceLooksAnd}
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Theme</div>
        <p className={settingsGroupHint}>{settingsCopy.appearance.appliedAcrossTheWorkspace}</p>
        <ThemePicker value={settings.theme} onSelect={(themeId) => change("theme", themeId)} />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Sidebar</div>
        <SettingToggle
          label="Compact sidebar"
          detail={settingsCopy.appearance.useTighterSpacingInTheNotes}
          checked={settings.compactSidebar}
          onChange={(checked) => change("compactSidebar", checked)}
          visualization={<CompactSidebarDemo enabled={settings.compactSidebar} />}
        />
        <SettingToggle
          label={settingsCopy.appearance.showTreeGuides}
          detail={settingsCopy.appearance.drawIndentGuidesForNestedNotes}
          checked={settings.showTreeGuides}
          onChange={(checked) => change("showTreeGuides", checked)}
          visualization={<TreeGuidesDemo enabled={settings.showTreeGuides} />}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Command palette</div>
        <SettingCardPicker
          label="Row density"
          detail={settingsCopy.appearance.howMuchSpaceEachResultIn}
          value={settings.paletteDensity}
          options={PALETTE_DENSITY_PICKER_OPTIONS}
          onChange={(value) => change("paletteDensity", value)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Accessibility</div>
        <SettingToggle
          label="Animated icons"
          detail={settingsCopy.appearance.playABriefAnimationWhenThe}
          checked={settings.animatedIcons}
          onChange={(checked) => change("animatedIcons", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Startup</div>
        <SettingToggle
          label={settingsCopy.appearance.rememberLastNote}
          detail={settingsCopy.appearance.returnToTheLastOpenNote}
          checked={settings.rememberLastNote}
          onChange={(checked) => change("rememberLastNote", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Notifications</div>
        <SettingToggle
          label={settingsCopy.appearance.showToastNotifications}
          detail={settingsCopy.appearance.showBriefNoticesLikeMovedTo}
          checked={settings.showToasts}
          onChange={(checked) => change("showToasts", checked)}
        />
      </div>
      {!BROWSER_RUNTIME && (
        <div className={settingsGroup}>
          <div className={settingsGroupTitle}>Optional features</div>
          <SettingToggle
            label="AI features"
            detail={settingsCopy.appearance.addAiProviderSettingsAndWriting}
            checked={settings.aiEnabled}
            onChange={changeAiEnabled}
          />
        </div>
      )}
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Advanced</div>
        <p className={settingsGroupHint}>
          {settingsCopy.appearance.finetuneTheSizeOfWorkspaceSurfaces}
        </p>
        <SettingCardPicker
          label={settingsCopy.appearance.commandPaletteSize}
          detail={settingsCopy.appearance.howTallAndWideTheCommand}
          value={settings.paletteSize}
          options={PALETTE_SIZE_PICKER_OPTIONS}
          onChange={(value) => change("paletteSize", value)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Preferences</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Reset preferences
            <span className={settingsRowDescription}>
              {settingsCopy.appearance.restoresAppearanceEditorAndKeyboardShortcuts}
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
