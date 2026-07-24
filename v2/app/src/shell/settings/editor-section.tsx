import { useEffect, useState } from "react";
import { updateSetting } from "../../actions/settings";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  projectSettings,
} from "../../settings/settings-model";
import type { EditableSettings, SettingsViewModel } from "../../settings/settings-model";
import { useRendererSelector } from "../../store/use-renderer-selector";
import { selectSettings } from "./selectors";
import { SettingToggle } from "./settings-shared";
import type { SectionProps } from "./settings-shared";

export function EditorSection({ store }: SectionProps) {
  const document = useRendererSelector(store, selectSettings);
  const settings = projectSettings(document);

  function change<K extends keyof EditableSettings>(
    field: K,
    value: EditableSettings[K],
  ): void {
    updateSetting(store, field, value);
  }

  return (
    <section aria-label="Editor preferences">
      <div className="settings-section-heading">
        <h1>Editor</h1>
        <p>Tune the writing surface without changing note content.</p>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Typography</div>
        <label className="settings-row" htmlFor="settings-editor-font">
          <span className="settings-row-label">Editor font</span>
          <select
            id="settings-editor-font"
            className="settings-select"
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
        <label className="settings-row" htmlFor="settings-line-height">
          <span className="settings-row-label">Line spacing</span>
          <select
            id="settings-line-height"
            className="settings-select"
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
      <div className="settings-group">
        <div className="settings-group-title">Writing</div>
        <PlaceholderField store={store} settings={settings} />
        <SettingToggle
          label="Default to raw Markdown"
          detail="New notes open in the raw Markdown editor. Toggle any note with mod+m."
          checked={settings.editorDefaultRawMode}
          onChange={(checked) => change("editorDefaultRawMode", checked)}
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
    <label className="settings-row settings-input-row" htmlFor="settings-placeholder">
      <span className="settings-row-label">
        Empty note prompt
        <span className="settings-row-description">Shown before a note has content.</span>
      </span>
      <input
        id="settings-placeholder"
        className="settings-text-input"
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
