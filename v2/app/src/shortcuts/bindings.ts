import { parseShortcut } from "@remcostoeten/use-shortcut/parser";
import type { WorkspaceSettings } from "../contracts/workspace";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId, ShortcutDefinition } from "./definitions";

export type ShortcutOverrides = Partial<Record<ShortcutActionId, string>>;

/**
 * Whether two combo strings resolve to the same runtime binding. Compares
 * parsed modifiers and key instead of raw text, matching exactly how the
 * shortcut engine matches events — so `mod+k`, `Ctrl + K`, and a recorded
 * `ctrl+k` all compare equal on platforms where `mod` means ctrl.
 */
export function sameCombo(left: string, right: string): boolean {
  const leftTrimmed = left.trim();
  const rightTrimmed = right.trim();
  if (leftTrimmed.length === 0 || rightTrimmed.length === 0) {
    return leftTrimmed === rightTrimmed;
  }
  const a = parseShortcut(leftTrimmed);
  const b = parseShortcut(rightTrimmed);
  return (
    a.modifiers.meta === b.modifiers.meta &&
    a.modifiers.ctrl === b.modifiers.ctrl &&
    a.modifiers.alt === b.modifiers.alt &&
    a.modifiers.shift === b.modifiers.shift &&
    (a.matchKey ?? a.key) === (b.matchKey ?? b.key)
  );
}

function defaultKeys(definition: ShortcutDefinition): string {
  return Array.isArray(definition.keys) ? (definition.keys[0] ?? "") : definition.keys;
}

export function shortcutOverridesFromSettings(
  settings: WorkspaceSettings,
): ShortcutOverrides {
  const raw = settings["shortcutOverrides"];
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const overrides: ShortcutOverrides = {};
  for (const definition of SHORTCUT_DEFINITIONS) {
    const value = (raw as Record<string, unknown>)[definition.id];
    if (typeof value === "string" && value.length > 0) {
      overrides[definition.id] = value;
    }
  }
  return overrides;
}

export function sameShortcutOverrides(
  left: ShortcutOverrides,
  right: ShortcutOverrides,
): boolean {
  const leftKeys = Object.keys(left) as (keyof ShortcutOverrides)[];
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

export function shortcutDefinition(id: ShortcutActionId): ShortcutDefinition {
  const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) {
    throw new Error(`unknown shortcut action: ${id}`);
  }
  return definition;
}

export function effectiveShortcutKeys(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
): string {
  return overrides[definition.id] ?? defaultKeys(definition);
}

export type ShortcutConflict = {
  actionId: ShortcutActionId;
  label: string;
};

/**
 * The action whose effective binding already uses `combo`, excluding the
 * action being rebound. Null means the combo is free to assign.
 */
export function findShortcutConflict(
  overrides: ShortcutOverrides,
  actionId: ShortcutActionId,
  combo: string,
): ShortcutConflict | null {
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.id === actionId) {
      continue;
    }
    if (sameCombo(effectiveShortcutKeys(definition, overrides), combo)) {
      return { actionId: definition.id, label: definition.label };
    }
  }
  return null;
}

export function isDefaultBinding(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
): boolean {
  const override = overrides[definition.id];
  return override === undefined || sameCombo(override, defaultKeys(definition));
}
