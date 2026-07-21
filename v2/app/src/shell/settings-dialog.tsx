import { useEffect, useState } from "react";
import { clearShortcutOverride, setShortcutOverride } from "../actions/settings";
import { revealWorkspaceStorage, workspaceStoragePath } from "../bridge/commands";
import { FolderOpenIcon, KeyboardIcon, DatabaseIcon } from "../shared/icons";
import { Dialog } from "../shared/ui/dialog";
import { ShortcutRecorder } from "../shared/ui/shortcut-recorder";
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

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ store, open, onOpenChange }: Props) {
  const [section, setSection] = useState<SectionId>("shortcuts");
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
          {section === "shortcuts" ? <ShortcutsSection store={store} /> : <DataSection />}
        </div>
      </div>
    </Dialog>
  );
}

type SectionProps = {
  store: RendererStore;
};

function ShortcutsSection({ store }: SectionProps) {
  const overrides = useRendererSelector(store, selectShortcutOverrides, sameOverrides);
  const groups = [...new Set(SHORTCUT_DEFINITIONS.map((definition) => definition.group))];

  return (
    <section aria-label="Keyboard shortcuts">
      <p className="settings-hint">
        Click a shortcut, then press the new key combination. Escape cancels.
      </p>
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
