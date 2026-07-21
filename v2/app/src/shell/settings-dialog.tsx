import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  clearShortcutOverride,
  setShortcutOverride,
  updateSetting,
} from "../actions/settings";
import {
  cancelWorkspaceMaintenance,
  createWorkspaceBackup,
  exportWorkspaceArchive,
  importWorkspaceArchive,
  listWorkspaceRecovery,
  restoreWorkspaceBackup,
  revealWorkspaceStorage,
  workspaceStoragePath,
} from "../bridge/commands";
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
import {
  IDLE_MAINTENANCE,
  backupNotDue,
  beginOperation,
  completeOperation,
  confirmOperation,
  confirmationCopy,
  describeBackupReport,
  describeExportReport,
  describeImportReport,
  describeSwapReport,
  dismissConfirmation,
  failOperation,
  formatSizeBytes,
  isMaintenanceBusy,
  projectRecoveryInventory,
  requestCancel,
  requestConfirmation,
} from "../settings/maintenance-model";
import type {
  BackupListEntry,
  MaintenanceKind,
  MaintenancePhase,
  RecoveryViewModel,
} from "../settings/maintenance-model";
import { noop } from "../shared/lib/noop";
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
    description: "Storage, backups, and recovery",
    searchText:
      "database storage local file manager workspace path export import archive backup restore recovery rollback safety snapshot",
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
          {section === "data" && <DataSection store={store} />}
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

const maintenanceTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const RUNNING_LABELS: Record<MaintenanceKind, string> = {
  export: "Exporting archive…",
  import: "Importing archive…",
  backup: "Backing up…",
  restore: "Restoring backup…",
};

function DataSection({ store }: SectionProps) {
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [phase, setPhase] = useState<MaintenancePhase>(IDLE_MAINTENANCE);
  const [importPath, setImportPath] = useState("");
  const [inventory, setInventory] = useState<RecoveryViewModel | null>(null);
  const [inventoryFailed, setInventoryFailed] = useState(false);
  const mountedRef = useRef(true);
  const busy = isMaintenanceBusy(phase);

  function refreshInventory(): void {
    listWorkspaceRecovery()
      .then((report) => {
        if (mountedRef.current) {
          setInventory(projectRecoveryInventory(report));
          setInventoryFailed(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setInventoryFailed(true);
        }
      });
  }

  useEffect(() => {
    mountedRef.current = true;
    workspaceStoragePath()
      .then((path) => {
        if (mountedRef.current) {
          setStoragePath(path);
        }
      })
      .catch((error) => {
        console.error("storage path lookup rejected", error);
      });
    refreshInventory();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function finish(update: (current: MaintenancePhase) => MaintenancePhase): void {
    if (mountedRef.current) {
      setPhase(update);
    }
  }

  function runExport(): void {
    const next = beginOperation(phase, "export");
    if (!next) {
      return;
    }
    setPhase(next);
    exportWorkspaceArchive()
      .then((report) => {
        finish((current) => completeOperation(current, describeExportReport(report)));
      })
      .catch((error) => {
        finish((current) => failOperation(current, String(error)));
      });
  }

  function runBackup(force: boolean): void {
    const next = beginOperation(phase, "backup");
    if (!next) {
      return;
    }
    setPhase(next);
    createWorkspaceBackup(force)
      .then((report) => {
        const outcome = describeBackupReport(report);
        finish((current) =>
          outcome.created
            ? completeOperation(current, outcome.detail)
            : backupNotDue(current, outcome.nextDueAt),
        );
        if (outcome.created) {
          refreshInventory();
        }
      })
      .catch((error) => {
        finish((current) => failOperation(current, String(error)));
      });
  }

  function runConfirmed(): void {
    if (phase.phase !== "confirming") {
      return;
    }
    const confirmation = phase.confirmation;
    const next = confirmOperation(phase);
    if (!next) {
      return;
    }
    setPhase(next);
    if (confirmation.kind === "import") {
      importWorkspaceArchive(confirmation.archivePath)
        .then((report) => {
          store.replaceFromSnapshot(report.snapshot);
          finish((current) => completeOperation(current, describeImportReport(report)));
          setImportPath("");
          refreshInventory();
        })
        .catch((error) => {
          finish((current) => failOperation(current, String(error)));
        });
      return;
    }
    restoreWorkspaceBackup(confirmation.artifactFileName)
      .then((report) => {
        const outcome = describeSwapReport(report);
        store.replaceFromSnapshot(report.snapshot);
        finish((current) =>
          outcome.restored
            ? completeOperation(current, outcome.detail)
            : failOperation(current, outcome.detail),
        );
        refreshInventory();
      })
      .catch((error) => {
        finish((current) => failOperation(current, String(error)));
      });
  }

  function cancelRunning(): void {
    setPhase((current) => requestCancel(current));
    cancelWorkspaceMaintenance().catch(() => {
      noop();
    });
  }

  const confirmation = phase.phase === "confirming" ? phase.confirmation : null;
  const copy = confirmation ? confirmationCopy(confirmation) : null;

  return (
    <section aria-label="Data">
      <div className="settings-section-heading">
        <h1>Data</h1>
        <p>Storage, portable archives, backups, and recovery for this workspace.</p>
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
      <div className="settings-group">
        <div className="settings-group-title">Portable archive</div>
        <div className="settings-row">
          <span className="settings-row-label">
            Export workspace
            <span className="settings-row-description">
              Writes a portable JSON archive into the exports folder next to the database.
            </span>
          </span>
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={runExport}
          >
            Export archive
          </button>
        </div>
        <div className="settings-row settings-input-row">
          <label className="settings-row-label" htmlFor="settings-import-path">
            Import archive
            <span className="settings-row-description">
              Replaces this workspace with a previously exported archive file.
            </span>
          </label>
          <div className="settings-inline-controls">
            <input
              id="settings-import-path"
              className="settings-text-input"
              type="text"
              placeholder="/path/to/skriuw-archive.json"
              value={importPath}
              disabled={busy}
              onChange={(event) => setImportPath(event.currentTarget.value)}
            />
            <button
              type="button"
              className="settings-button"
              disabled={busy || importPath.trim() === ""}
              onClick={() => {
                const next = requestConfirmation(phase, {
                  kind: "import",
                  archivePath: importPath.trim(),
                });
                if (next) {
                  setPhase(next);
                }
              }}
            >
              Import…
            </button>
          </div>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Backups</div>
        <div className="settings-row">
          <span className="settings-row-label">
            Scheduled backups
            <span className="settings-row-description">
              The desktop app takes a verified backup every six hours while it runs.
            </span>
          </span>
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={() => runBackup(false)}
          >
            Back up now
          </button>
        </div>
        <BackupInventory
          inventory={inventory}
          failed={inventoryFailed}
          busy={busy}
          onRetry={refreshInventory}
          onRestore={(entry) => {
            const next = requestConfirmation(phase, {
              kind: "restore",
              artifactFileName: entry.fileName,
              createdAt: entry.createdAt,
            });
            if (next) {
              setPhase(next);
            }
          }}
        />
      </div>
      <MaintenanceStatus
        phase={phase}
        onCancel={cancelRunning}
        onForceBackup={() => runBackup(true)}
      />
      {confirmation && copy && (
        <Dialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPhase((current) => dismissConfirmation(current));
            }
          }}
          title={copy.title}
          className="settings-confirm-dialog"
        >
          <p className="settings-confirm-body">{copy.body}</p>
          <div className="settings-confirm-actions">
            <button
              type="button"
              className="settings-button"
              onClick={() => setPhase((current) => dismissConfirmation(current))}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-button settings-button-danger"
              onClick={runConfirmed}
            >
              {copy.confirmLabel}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

type BackupInventoryProps = {
  inventory: RecoveryViewModel | null;
  failed: boolean;
  busy: boolean;
  onRetry: () => void;
  onRestore: (entry: BackupListEntry) => void;
};

function BackupInventory({
  inventory,
  failed,
  busy,
  onRetry,
  onRestore,
}: BackupInventoryProps) {
  if (failed) {
    return (
      <div className="settings-row settings-maintenance-error" role="alert">
        <span className="settings-row-label">Backups could not be listed.</span>
        <button type="button" className="settings-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (inventory === null) {
    return (
      <p className="settings-row-detail settings-maintenance-loading" role="status">
        Loading backups…
      </p>
    );
  }
  if (inventory.empty) {
    return (
      <p className="settings-row-detail" role="status">
        No backups yet. Use “Back up now” or wait for the next scheduled backup.
      </p>
    );
  }
  return (
    <>
      <ul className="settings-backup-list" aria-label="Retained backups">
        {inventory.backups.map((entry) => (
          <li key={entry.fileName} className="settings-backup-item">
            <span className="settings-row-label">
              {entry.fileName}
              <span className="settings-row-detail">
                {maintenanceTimeFormatter.format(new Date(entry.createdAt))} ·{" "}
                {formatSizeBytes(entry.sizeBytes)}
                {entry.verified ? "" : " · unverified"}
              </span>
            </span>
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => onRestore(entry)}
            >
              Restore…
            </button>
          </li>
        ))}
      </ul>
      {inventory.rollbacks.length > 0 && (
        <>
          <div className="settings-group-title">Kept after restores</div>
          <ul className="settings-backup-list" aria-label="Rollback databases">
            {inventory.rollbacks.map((entry) => (
              <li key={entry.fileName} className="settings-backup-item">
                <span className="settings-row-label">
                  {entry.fileName}
                  <span className="settings-row-detail">
                    {maintenanceTimeFormatter.format(new Date(entry.createdAt))} ·{" "}
                    {formatSizeBytes(entry.sizeBytes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

type MaintenanceStatusProps = {
  phase: MaintenancePhase;
  onCancel: () => void;
  onForceBackup: () => void;
};

function MaintenanceStatus({ phase, onCancel, onForceBackup }: MaintenanceStatusProps) {
  if (phase.phase === "running") {
    return (
      <div className="settings-maintenance-status" role="status">
        <span>{RUNNING_LABELS[phase.kind]}</span>
        <button
          type="button"
          className="settings-button"
          disabled={phase.cancelRequested}
          onClick={onCancel}
        >
          {phase.cancelRequested ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    );
  }
  if (phase.phase === "success") {
    return (
      <p className="settings-maintenance-status is-success" role="status">
        {phase.detail}
      </p>
    );
  }
  if (phase.phase === "cancelled") {
    return (
      <p className="settings-maintenance-status" role="status">
        {RUNNING_LABELS[phase.kind].replace("…", "")} was cancelled. Nothing changed.
      </p>
    );
  }
  if (phase.phase === "notDue") {
    return (
      <div className="settings-maintenance-status" role="status">
        <span>
          Backup not due yet. Next scheduled backup{" "}
          {maintenanceTimeFormatter.format(new Date(phase.nextDueAt))}.
        </span>
        <button type="button" className="settings-button" onClick={onForceBackup}>
          Back up anyway
        </button>
      </div>
    );
  }
  if (phase.phase === "error") {
    return (
      <p className="settings-maintenance-status is-error" role="alert">
        {phase.message}
      </p>
    );
  }
  return null;
}
