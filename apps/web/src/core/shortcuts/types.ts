import type { ShortcutId } from "./registry";

export type ShortcutHandler = (event: KeyboardEvent) => void;

export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

/**
 * Sparse map of user overrides. Absent ids fall back to the registry default.
 * Overrides are always a single combo string even where the default registers
 * several combos, so remapping a multi-combo shortcut collapses it to one.
 */
export type ShortcutBindings = Partial<Record<ShortcutId, string>>;
