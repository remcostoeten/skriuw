import type { WorkspaceSettings } from "../contracts/workspace";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId, ShortcutDefinition } from "./definitions";

export type ShortcutOverrides = Partial<Record<ShortcutActionId, string>>;

const MODIFIER_ORDER = ["mod", "ctrl", "alt", "shift", "meta"] as const;

/**
 * Canonical form of a combo string so `Shift+Mod+K`, `mod+shift+k`, and
 * `MOD + SHIFT + K` all compare equal: lowercase, trimmed, modifiers in a
 * fixed order, key last.
 */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier));
  const keys = parts.filter(
    (part) => !(MODIFIER_ORDER as readonly string[]).includes(part),
  );
  return [...modifiers, ...keys].join("+");
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
  const normalized = normalizeCombo(combo);
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.id === actionId) {
      continue;
    }
    if (normalizeCombo(effectiveShortcutKeys(definition, overrides)) === normalized) {
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
  return (
    override === undefined ||
    normalizeCombo(override) === normalizeCombo(defaultKeys(definition))
  );
}
