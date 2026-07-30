import { matchesShortcut, parseShortcut } from "@remcostoeten/use-shortcut/parser";
import { SIDEBAR_TREE_SELECTOR } from "../commands/focus-regions";
import type { WorkspaceSettings } from "../contracts/workspace";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type {
  ShortcutActionId,
  ShortcutDefinition,
  ShortcutGuard,
  ShortcutPlatform,
} from "./definitions";

export type ShortcutOverrides = Partial<Record<ShortcutActionId, string>>;

const MODAL_SELECTOR = 'dialog[open], [role="dialog"], [data-modal="true"]';

/** Multi-step combos, e.g. "g then t then 1", give the user this long to land the next key. */
const SEQUENCE_TIMEOUT_MS = 1000;

/** Whether a combo string is a multi-step sequence rather than a single chord. */
export function isKeySequence(keys: string): boolean {
  return keys.includes(" then ");
}

/**
 * Extra handler options a sequence binding needs beyond its combo. A plain
 * chord gets nothing extra; a sequence gets the shared sequence timeout so
 * a stalled `g`/`t` doesn't linger indefinitely.
 */
export function sequenceHandlerOptions(keys: string): { sequenceTimeout?: number } {
  return isKeySequence(keys) ? { sequenceTimeout: SEQUENCE_TIMEOUT_MS } : {};
}

type PhysicalShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

const PHYSICAL_CODE_BY_KEY: ReadonlyMap<string, string> = new Map([
  ["0", "Digit0"],
  ["1", "Digit1"],
  ["2", "Digit2"],
  ["3", "Digit3"],
  ["4", "Digit4"],
  ["5", "Digit5"],
  ["6", "Digit6"],
  ["7", "Digit7"],
  ["8", "Digit8"],
  ["9", "Digit9"],
  ["`", "Backquote"],
  ["~", "Backquote"],
  ["-", "Minus"],
  ["_", "Minus"],
  ["=", "Equal"],
  ["+", "Equal"],
  ["[", "BracketLeft"],
  ["{", "BracketLeft"],
  ["]", "BracketRight"],
  ["}", "BracketRight"],
  ["\\", "Backslash"],
  ["|", "Backslash"],
  [";", "Semicolon"],
  [":", "Semicolon"],
  ["'", "Quote"],
  ['"', "Quote"],
  [",", "Comma"],
  ["<", "Comma"],
  [".", "Period"],
  [">", "Period"],
  ["/", "Slash"],
  ["?", "Slash"],
]);

export function shortcutMatchesPhysicalKey(
  event: PhysicalShortcutEvent,
  keys: string,
): boolean {
  if (isKeySequence(keys)) {
    return false;
  }
  const parsed = parseShortcut(keys);
  if (matchesShortcut(event as KeyboardEvent, parsed)) {
    return false;
  }
  const expectedCode = PHYSICAL_CODE_BY_KEY.get(parsed.key);
  return (
    expectedCode !== undefined &&
    event.code === expectedCode &&
    event.metaKey === parsed.modifiers.meta &&
    event.ctrlKey === parsed.modifiers.ctrl &&
    event.altKey === parsed.modifiers.alt &&
    event.shiftKey === parsed.modifiers.shift
  );
}

const TEXT_FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * The parts of an event target the guards read. Duck-typed instead of
 * `instanceof HTMLElement` so the predicates stay pure and unit-testable
 * outside a browser.
 */
export type ShortcutGuardTarget = {
  tagName?: unknown;
  isContentEditable?: unknown;
  closest?: (selector: string) => unknown;
};

export type ShortcutGuardEvent = { target?: ShortcutGuardTarget | null };

function inTextField(target: ShortcutGuardTarget): boolean {
  return typeof target.tagName === "string" && TEXT_FIELD_TAGS.has(target.tagName);
}

function inSelector(target: ShortcutGuardTarget, selector: string): boolean {
  return typeof target.closest === "function" && target.closest(selector) != null;
}

const GUARD_PREDICATES: Record<ShortcutGuard, (target: ShortcutGuardTarget) => boolean> = {
  typing: (target) => inTextField(target) || target.isContentEditable === true,
  textField: inTextField,
  sidebarTree: (target) => inSelector(target, SIDEBAR_TREE_SELECTOR),
  modal: () =>
    typeof document !== "undefined" &&
    typeof document.querySelector === "function" &&
    document.querySelector(MODAL_SELECTOR) != null,
};

/**
 * Whether any of `guards` vetoes the keypress. Guards are additive: a binding
 * fires only when every one of them declines.
 */
export function shortcutGuarded(
  guards: readonly ShortcutGuard[],
  event: ShortcutGuardEvent,
): boolean {
  const target = event.target;
  if (target === null || target === undefined || typeof target !== "object") {
    return guards.includes("modal") && GUARD_PREDICATES.modal({});
  }
  return guards.some((guard) => GUARD_PREDICATES[guard](target));
}

/**
 * Guards a binding declares, in the order they are evaluated. `worksWhileTyping`
 * is the legacy switch for the `typing` guard, so definitions can keep using it.
 */
export function shortcutGuards(
  definition: ShortcutDefinition,
  worksWhileTyping: boolean,
): readonly ShortcutGuard[] {
  const declared = definition.guards ?? [];
  return worksWhileTyping ? declared : ["typing", ...declared];
}

/**
 * The `except` value to hand the shortcut engine. Returns undefined when the
 * binding is unguarded so the engine can skip predicate work entirely.
 */
export function shortcutExcept(
  definition: ShortcutDefinition,
  worksWhileTyping: boolean,
): ((event: KeyboardEvent) => boolean) | undefined {
  const guards = shortcutGuards(definition, worksWhileTyping);
  if (guards.length === 0) {
    return undefined;
  }
  return (event) => shortcutGuarded(guards, event as ShortcutGuardEvent);
}

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

/**
 * Whether a binding should be registered on `platform`. A default combo can
 * declare the platforms it belongs on, so a combo the OS already owns stays
 * unbound there; a user override always wins, on every platform.
 */
export function shortcutBindsOnPlatform(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
  platform: ShortcutPlatform,
): boolean {
  if (overrides[definition.id] !== undefined) {
    return true;
  }
  return definition.platforms === undefined || definition.platforms.includes(platform);
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
