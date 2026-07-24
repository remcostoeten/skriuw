import type { MutableRefObject } from "react";
import { clearShortcutOverride, setShortcutOverride } from "../../actions/settings";
import { ShortcutRecorder } from "../../shared/ui/shortcut-recorder";
import {
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  sameCombo,
} from "../../shortcuts/bindings";
import { SHORTCUT_DEFINITIONS } from "../../shortcuts/definitions";
import { useRendererSelector } from "../../store/use-renderer-selector";
import { sameOverrides, selectShortcutOverrides } from "./selectors";
import type { SectionProps } from "./settings-shared";

export function ShortcutsSection({
  store,
  recordingCountRef,
}: SectionProps & { recordingCountRef: MutableRefObject<number> }) {
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
                  onRecordingChange={(recording) => {
                    recordingCountRef.current += recording ? 1 : -1;
                  }}
                  onRecord={(combo) => {
                    const conflict = findShortcutConflict(overrides, definition.id, combo);
                    if (conflict) {
                      return `Already used by “${conflict.label}”`;
                    }
                    if (sameCombo(combo, effectiveShortcutKeys(definition, overrides))) {
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
