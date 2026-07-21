import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  clearShortcutOverride,
  setShortcutOverride,
  updateSetting,
} from "../actions/settings";
import { revealWorkspaceStorage, workspaceStoragePath } from "../bridge/commands";
import {
  CloseIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderOpenIcon,
  KeyboardIcon,
  SearchIcon,
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
  filterSettingsSections,
  moveSettingsSection,
  rovingSettingsSection,
} from "../settings/settings-navigation";
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
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and density",
    searchText:
      "color midnight paper embers mocha rose pine catppuccin gruvbox tokyo night compact sidebar tree guides indent reduce motion remember last note workspace",
    icon: SettingsIcon,
  },
  {
    id: "editor",
    label: "Editor",
    description: "Writing experience",
    searchText:
      "font typography sans serif mono line spacing cozy comfortable relaxed empty note prompt placeholder writing",
    icon: FileTextIcon,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard bindings",
    searchText: `keys hotkeys remap commands ${SHORTCUT_DEFINITIONS.map((definition) => `${definition.label} ${definition.group}`).join(" ")}`,
    icon: KeyboardIcon,
  },
  {
    id: "data",
    label: "Data",
    description: "Local workspace files",
    searchText: "database storage local file manager workspace path",
    icon: DatabaseIcon,
  },
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
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const filteredSections = useMemo(
    () => filterSettingsSections(SECTIONS, query),
    [query],
  );
  const filteredIds = filteredSections.map((entry) => entry.id);
  const rovingSection = rovingSettingsSection(filteredIds, section);
  const activeMeta = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0];

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  function focusSection(id: SectionId): void {
    requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${id}`)?.focus();
    });
  }

  function focusFirstSetting(): void {
    requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>(
          "section select:not([disabled]), section input:not([disabled]), section button:not([disabled]), section a[href]",
        )
        ?.focus();
    });
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>): void {
    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (
      event.key.toLocaleLowerCase() === "e" &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (rovingSection) {
        focusSection(rovingSection);
      }
      return;
    }
    if (event.key !== "F6") {
      return;
    }
    event.preventDefault();
    const activeTab = rovingSection
      ? document.getElementById(`settings-tab-${rovingSection}`)
      : null;
    const regions = [searchRef.current, activeTab, contentRef.current].filter(
      (region): region is HTMLElement => region !== null,
    );
    const active = document.activeElement;
    const currentIndex = Math.max(
      0,
      regions.findIndex((region) => region === active || region.contains(active)),
    );
    const offset = event.shiftKey ? -1 : 1;
    regions[(currentIndex + offset + regions.length) % regions.length]?.focus();
  }

  function handleNavKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "tab") {
      return;
    }
    const current = target.dataset.sectionId as SectionId | undefined;
    if (!current) {
      return;
    }
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "ArrowRight"
    ) {
      event.preventDefault();
      setSection(current);
      focusFirstSetting();
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowUp" && filteredIds[0] === current) {
      searchRef.current?.focus();
      return;
    }
    const next = moveSettingsSection(filteredIds, current, event.key);
    if (next) {
      setSection(next);
      focusSection(next);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      className="settings-dialog"
      onKeyDown={handleDialogKeyDown}
      showHeader={false}
    >
      <div className="settings-layout">
        <nav
          ref={navRef}
          className="settings-nav"
          aria-label="Settings sections"
          onKeyDown={handleNavKeyDown}
        >
          <div className="settings-search-wrap">
            <SearchIcon size={14} aria-hidden="true" className="settings-search-icon" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              className="settings-search"
              placeholder="Search settings"
              aria-label="Search settings"
              aria-controls="settings-tablist"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
                  return;
                }
                if (event.key === "ArrowDown" && rovingSection) {
                  event.preventDefault();
                  focusSection(rovingSection);
                  return;
                }
                if (event.key === "Enter" && filteredSections[0]) {
                  event.preventDefault();
                  setSection(filteredSections[0].id);
                  focusFirstSetting();
                }
              }}
            />
            <kbd className="settings-search-hint" aria-hidden="true">/</kbd>
          </div>
          <div
            id="settings-tablist"
            role="tablist"
            aria-orientation="vertical"
            aria-label="Settings sections"
            className="settings-tablist"
          >
            {filteredSections.map((entry) => (
              <button
                key={entry.id}
                id={`settings-tab-${entry.id}`}
                type="button"
                role="tab"
                data-section-id={entry.id}
                tabIndex={rovingSection === entry.id ? 0 : -1}
                className={`settings-nav-item${section === entry.id ? " is-active" : ""}`}
                aria-selected={section === entry.id}
                aria-controls="settings-tabpanel"
                onClick={() => setSection(entry.id)}
              >
                <entry.icon size={15} aria-hidden="true" />
                <span className="settings-nav-copy">
                  <span>{entry.label}</span>
                  {query && <span>{entry.description}</span>}
                </span>
              </button>
            ))}
          </div>
          {filteredSections.length === 0 && (
            <p className="settings-search-empty" role="status">
              No settings match “{query.trim()}”.
            </p>
          )}
          <p className="settings-nav-help">
            <kbd>/</kbd> Search <span aria-hidden="true">·</span> <kbd>Ctrl E</kbd> Sections
          </p>
        </nav>
        <div
          ref={contentRef}
          id="settings-tabpanel"
          role="tabpanel"
          aria-label={`${activeMeta.label} settings`}
          tabIndex={0}
          className="settings-content"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && event.target === event.currentTarget) {
              event.preventDefault();
              if (rovingSection) {
                focusSection(rovingSection);
              }
            }
          }}
        >
          <button
            type="button"
            className="settings-close-button"
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
          >
            <CloseIcon size={16} />
          </button>
          {section === "appearance" && <AppearanceSection store={store} />}
          {section === "editor" && <EditorSection store={store} />}
          {section === "shortcuts" && <ShortcutsSection store={store} />}
          {section === "data" && <DataSection />}
        </div>
      </div>
    </Dialog>
  );
}

function isTypingTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
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
        <h1>Appearance</h1>
        <p>Choose how the workspace looks and behaves.</p>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Theme</div>
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
        <h1>Shortcuts</h1>
        <p>Click a shortcut, then press a new key combination. Escape cancels.</p>
      </div>
      {groups.map((group) => (
        <div key={group} className="settings-group">
          <div className="settings-group-title">{group}</div>
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
        <h1>Data</h1>
        <p>Find the local files that hold this workspace.</p>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Storage</div>
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
