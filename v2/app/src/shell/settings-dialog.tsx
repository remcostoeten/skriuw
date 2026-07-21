import { useEffect, useState } from "react";
import {
  clearShortcutOverride,
  setShortcutOverride,
  updateSetting,
} from "../actions/settings";
import { revealWorkspaceStorage, workspaceStoragePath } from "../bridge/commands";
import {
  DatabaseIcon,
  FileTextIcon,
  FolderOpenIcon,
  KeyboardIcon,
  SettingsIcon,
} from "../shared/icons";
import { Dialog } from "../shared/ui/dialog";
import { ShortcutRecorder } from "../shared/ui/shortcut-recorder";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  THEME_OPTIONS,
  projectSettings,
} from "../settings/settings-model";
import type { EditableSettings, SettingsViewModel } from "../settings/settings-model";
import {
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  normalizeCombo,
  shortcutOverridesFromSettings,
} from "../shortcuts/bindings";
import type { ShortcutOverrides } from "../shortcuts/bindings";
import { SHORTCUT_DEFINITIONS } from "../shortcuts/definitions";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: SettingsIcon },
  { id: "editor", label: "Editor", icon: FileTextIcon },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
  { id: "data", label: "Data", icon: DatabaseIcon },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function selectShortcutOverrides(state: RendererState): ShortcutOverrides {
  return shortcutOverridesFromSettings(state.settings);
}

function sameOverrides(left: ShortcutOverrides, right: ShortcutOverrides): boolean {
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key as keyof ShortcutOverrides] === right[key as keyof ShortcutOverrides])
  );
}

function selectSettings(state: RendererState) {
  return state.settings;
}

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ store, open, onOpenChange }: Props) {
  const [section, setSection] = useState<SectionId>("appearance");
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings" className="settings-dialog">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`settings-nav-item${section === entry.id ? " is-active" : ""}`}
              aria-current={section === entry.id}
              onClick={() => setSection(entry.id)}
            >
              <entry.icon size={15} />
              {entry.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === "appearance" && <AppearanceSection store={store} />}
          {section === "editor" && <EditorSection store={store} />}
          {section === "shortcuts" && <ShortcutsSection store={store} />}
          {section === "data" && <DataSection />}
        </div>
      </div>
    </Dialog>
  );
}

type SectionProps = {
  store: RendererStore;
};

type ToggleProps = {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function SettingToggle({ label, detail, checked, onChange }: ToggleProps) {
  return (
    <label className="settings-row settings-toggle-row">
      <span className="settings-row-label">
        {label}
        <span className="settings-row-description">{detail}</span>
      </span>
      <input
        type="checkbox"
        className="settings-toggle-input"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function AppearanceSection({ store }: SectionProps) {
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
        <h3>Appearance</h3>
        <p>Choose how the workspace looks and behaves.</p>
      </div>
      <div className="settings-group">
        <h3 className="settings-group-title">Theme</h3>
        <label className="settings-row" htmlFor="settings-theme">
          <span className="settings-row-label">
            Color theme
            <span className="settings-row-description">Applied across the workspace.</span>
          </span>
          <select
            id="settings-theme"
            className="settings-select"
            value={settings.theme}
            onChange={(event) => change("theme", event.currentTarget.value)}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings-group">
        <h3 className="settings-group-title">Workspace</h3>
        <SettingToggle
          label="Compact sidebar"
          detail="Use tighter spacing in the notes tree."
          checked={settings.compactSidebar}
          onChange={(checked) => change("compactSidebar", checked)}
        />
        <SettingToggle
          label="Show page icons"
          detail="Display note icons beside titles."
          checked={settings.showPageIcons}
          onChange={(checked) => change("showPageIcons", checked)}
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

function EditorSection({ store }: SectionProps) {
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
        <h3>Editor</h3>
        <p>Tune the writing surface without changing note content.</p>
      </div>
      <div className="settings-group">
        <h3 className="settings-group-title">Typography</h3>
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
        <h3 className="settings-group-title">Writing</h3>
        <SettingToggle
          label="Show line numbers"
          detail="Display line numbers beside editor content."
          checked={settings.showLineNumbers}
          onChange={(checked) => change("showLineNumbers", checked)}
        />
        <PlaceholderField store={store} settings={settings} />
      </div>
    </section>
  );
}

type PlaceholderProps = {
  store: RendererStore;
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

function ShortcutsSection({ store }: SectionProps) {
  const overrides = useRendererSelector(store, selectShortcutOverrides, sameOverrides);
  const groups = [...new Set(SHORTCUT_DEFINITIONS.map((definition) => definition.group))];

  return (
    <section aria-label="Keyboard shortcuts">
      <div className="settings-section-heading">
        <h3>Shortcuts</h3>
        <p>Click a shortcut, then press a new key combination. Escape cancels.</p>
      </div>
      {groups.map((group) => (
        <div key={group} className="settings-group">
          <h3 className="settings-group-title">{group}</h3>
          {SHORTCUT_DEFINITIONS.filter((definition) => definition.group === group).map(
            (definition) => (
              <div key={definition.id} className="settings-row">
                <span className="settings-row-label">{definition.label}</span>
                <ShortcutRecorder
                  value={effectiveShortcutKeys(definition, overrides)}
                  isDefault={isDefaultBinding(definition, overrides)}
                  aria-label={`Change shortcut for ${definition.label}`}
                  onRecord={(combo) => {
                    const conflict = findShortcutConflict(overrides, definition.id, combo);
                    if (conflict) {
                      return `Already used by “${conflict.label}”`;
                    }
                    if (
                      normalizeCombo(combo) ===
                      normalizeCombo(effectiveShortcutKeys(definition, overrides))
                    ) {
                      return null;
                    }
                    setShortcutOverride(store, definition.id, combo);
                    return null;
                  }}
                  onReset={() => clearShortcutOverride(store, definition.id)}
                />
              </div>
            ),
          )}
        </div>
      ))}
    </section>
  );
}

function DataSection() {
  const [storagePath, setStoragePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaceStoragePath()
      .then((path) => {
        if (!cancelled) {
          setStoragePath(path);
        }
      })
      .catch((error) => {
        console.error("storage path lookup rejected", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Data">
      <div className="settings-section-heading">
        <h3>Data</h3>
        <p>Find the local files that hold this workspace.</p>
      </div>
      <div className="settings-group">
        <h3 className="settings-group-title">Storage</h3>
        <div className="settings-row">
          <span className="settings-row-label">
            Workspace database
            <span className="settings-row-detail">{storagePath ?? "Locating…"}</span>
          </span>
          <button
            type="button"
            className="settings-button"
            onClick={() => {
              revealWorkspaceStorage().catch((error) => {
                console.error("reveal storage rejected", error);
              });
            }}
          >
            <FolderOpenIcon size={15} />
            Show in file manager
          </button>
        </div>
      </div>
    </section>
  );
}
