import { useEffect, useState } from "react";
import { updateSetting } from "../../actions/settings";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
} from "../../settings/settings-model";
import type { SettingsViewModel } from "../../settings/settings-model";
import { cn } from "../../shared/lib/utils";
import {
  SettingToggle,
  SettingsHeading,
  settingsGroup,
  settingsGroupTitle,
  settingsInputRow,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
  settingsSelect,
  settingsTextInput,
  useEditableSettings,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

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
        <label className={settingsRow} htmlFor="settings-editor-font">
          <span className={settingsRowLabel}>Editor font</span>
          <select
            id="settings-editor-font"
            className={settingsSelect}
            value={settings.editorFont}
            onChange={(event) => change("editorFont", event.currentTarget.value)}
          >
            {EDITOR_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={settingsRow} htmlFor="settings-line-height">
          <span className={settingsRowLabel}>Line spacing</span>
          <select
            id="settings-line-height"
            className={settingsSelect}
            value={settings.editorLineHeight}
            onChange={(event) => change("editorLineHeight", event.currentTarget.value)}
          >
            {EDITOR_LINE_HEIGHT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
