import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { updateSetting } from "../../actions/settings";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
} from "../../settings/settings-model";
import type { SettingsViewModel } from "../../settings/settings-model";
import { cn } from "../../shared/lib/utils";
import {
  SettingCardPicker,
  SettingToggle,
  SettingsHeading,
  settingsGroup,
  settingsGroupTitle,
  settingsInputRow,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
  settingsTextInput,
  useEditableSettings,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

const FONT_PREVIEW_STYLES: Record<string, CSSProperties> = {
  inter: {},
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' },
  mono: { fontFamily: "var(--font-mono)" },
};

const LINE_HEIGHT_PREVIEW_GAPS: Record<string, number> = {
  cozy: 3,
  comfortable: 5,
  relaxed: 8,
};

const FONT_PICKER_OPTIONS = EDITOR_FONT_OPTIONS.map((option) => ({
  ...option,
  preview: (
    <span
      className="text-xl leading-none text-foreground/80"
      style={FONT_PREVIEW_STYLES[option.value]}
      aria-hidden="true"
    >
      Ag
    </span>
  ),
}));

const LINE_HEIGHT_PICKER_OPTIONS = EDITOR_LINE_HEIGHT_OPTIONS.map((option) => ({
  ...option,
  preview: <LineSpacingPreview gap={LINE_HEIGHT_PREVIEW_GAPS[option.value] ?? 5} />,
}));

function LineSpacingPreview({ gap }: { gap: number }) {
  return (
    <span
      className="flex w-full flex-col justify-center px-5"
      style={{ gap }}
      aria-hidden="true"
    >
      <span className="h-[3px] w-full rounded-full bg-foreground/25" />
      <span className="h-[3px] w-4/5 rounded-full bg-foreground/25" />
      <span className="h-[3px] w-[90%] rounded-full bg-foreground/25" />
      <span className="h-[3px] w-3/5 rounded-full bg-foreground/25" />
    </span>
  );
}

export function EditorSection({ store }: SectionProps) {
  const { settings, change } = useEditableSettings(store);

  return (
    <section aria-label="Editor preferences" className={settingsSection}>
      <SettingsHeading
        title="Editor"
        detail="Tune the writing surface without changing note content."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Typography</div>
        <SettingCardPicker
          label="Editor font"
          detail="Used for note content in the rendered editor."
          value={settings.editorFont}
          options={FONT_PICKER_OPTIONS}
          onChange={(value) => change("editorFont", value)}
        />
        <SettingCardPicker
          label="Line spacing"
          detail="How much room each line of text gets."
          value={settings.editorLineHeight}
          options={LINE_HEIGHT_PICKER_OPTIONS}
          onChange={(value) => change("editorLineHeight", value)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Writing</div>
        <PlaceholderField store={store} settings={settings} />
        <SettingToggle
          label="Default to raw Markdown"
          detail="New notes open in the raw Markdown editor. Toggle any note with mod+m."
          checked={settings.editorDefaultRawMode}
          onChange={(checked) => change("editorDefaultRawMode", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Tabs</div>
        <SettingToggle
          label="Open notes in tabs"
          detail="Every note you open gets its own tab. When off, opening a note replaces the current tab."
          checked={settings.openNotesInTabs}
          onChange={(checked) => change("openNotesInTabs", checked)}
        />
      </div>
    </section>
  );
}

type PlaceholderProps = {
  store: SectionProps["store"];
  settings: SettingsViewModel;
};

function PlaceholderField({ store, settings }: PlaceholderProps) {
  const [value, setValue] = useState(settings.editorPlaceholder);

  useEffect(() => {
    setValue(settings.editorPlaceholder);
  }, [settings.editorPlaceholder]);

  return (
    <label className={cn(settingsRow, settingsInputRow)} htmlFor="settings-placeholder">
      <span className={settingsRowLabel}>
        Empty note prompt
        <span className={settingsRowDescription}>Shown before a note has content.</span>
      </span>
      <input
        id="settings-placeholder"
        className={settingsTextInput}
        type="text"
        value={value}
        maxLength={512}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={() => {
          if (value !== settings.editorPlaceholder) {
            updateSetting(store, "editorPlaceholder", value);
          }
        }}
      />
    </label>
  );
}
