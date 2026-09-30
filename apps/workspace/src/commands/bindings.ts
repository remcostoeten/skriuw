import { matchesShortcut, parseShortcut } from "@remcostoeten/use-shortcut/parser";
import { SIDEBAR_TREE_SELECTOR } from "./focus-regions";
import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type {
  ShortcutActionId,
  ShortcutDefinition,
  ShortcutGuard,
  ShortcutPlatform,
} from "./definitions";

/**
 * Effective user rebinds keyed by action. `null` means the action is switched
 * off entirely; only Quit can be, through `quitShortcutEnabled`.
 */
export type ShortcutOverrides = Partial<Record<ShortcutActionId, string | null>>;

export const QUIT_ACTION_ID = "quitApp" satisfies ShortcutActionId;

const QUIT_ENABLED_SETTING = "quitShortcutEnabled";

/** Chords Quit may never take, because text fields and the editor need them. */
const QUIT_RESERVED_COMBOS = ["mod+a", "mod+c", "mod+v", "mod+x", "mod+z", "mod+shift+z", "mod+y"];

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

export function shortcutMatchesPhysicalKey(event: PhysicalShortcutEvent, keys: string): boolean {
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

/**
 * @name quitShortcutEnabled
 * @description Whether the Quit action answers to a keyboard shortcut. On unless
 * the workspace explicitly switched it off.
 *
 * @example
 * if (!quitShortcutEnabled(state.settings)) {
 *   return;
 * }
 */
export function quitShortcutEnabled(settings: WorkspaceSettings): boolean {
  return settings[QUIT_ENABLED_SETTING] !== false;
}

/**
 * @name changeQuitShortcutEnabled
 * @description Returns settings with the Quit shortcut switched on or off. The
 * stored Quit combo is kept, so switching back on restores the user's rebind.
 *
 * @example
 * updateSettings(store, changeQuitShortcutEnabled(settings, false));
 */
export function changeQuitShortcutEnabled(
  settings: WorkspaceSettings,
  enabled: boolean,
): WorkspaceSettings {
  return { ...settings, [QUIT_ENABLED_SETTING]: enabled };
}

/**
 * @name quitComboError
 * @description Validates a combo for Quit. Quit must be a single chord of two or
 * three keys that holds Ctrl or Cmd, like `ctrl+q` or `ctrl+shift+w`, and may
 * not take a clipboard or undo chord. Returns the reason it is refused, or null.
 *
 * @example
 * const error = quitComboError("ctrl+shift+w");
 */
export function quitComboError(combo: string): string | null {
  const trimmed = combo.trim();
  if (trimmed.length === 0 || isKeySequence(trimmed)) {
    return "Quit needs a single key combination";
  }
  const parsed = parseShortcut(trimmed);
  if (!parsed.modifiers.ctrl && !parsed.modifiers.meta) {
    return "Quit needs Ctrl or Cmd in the combination";
  }
  const keyCount = Object.values(parsed.modifiers).filter(Boolean).length + 1;
  if (keyCount > 3) {
    return "Quit takes two or three keys";
  }
  if (QUIT_RESERVED_COMBOS.some((reserved) => sameCombo(reserved, trimmed))) {
    return "Reserved for editing text";
  }
  return null;
}

/**
 * @name storedShortcutOverrides
 * @description The combos the user recorded, including a Quit combo that is
 * currently switched off. What the shortcuts settings display and edit; runtime
 * binding reads `shortcutOverridesFromSettings` instead.
 *
 * @example
 * const recorded = storedShortcutOverrides(state.settings);
 */
export function storedShortcutOverrides(settings: WorkspaceSettings): ShortcutOverrides {
  const raw = settings["shortcutOverrides"];
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const overrides: ShortcutOverrides = {};
  for (const definition of SHORTCUT_DEFINITIONS) {
    const value = (raw as Record<string, unknown>)[definition.id];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    if (definition.id === QUIT_ACTION_ID && quitComboError(value) !== null) {
      continue;
    }
    overrides[definition.id] = value;
  }
  return overrides;
}

/**
 * @name shortcutOverridesFromSettings
 * @description The overrides every binder and hint reads: the recorded combos,
 * with Quit set to `null` while its shortcut is switched off.
 *
 * @example
 * const overrides = shortcutOverridesFromSettings(state.settings);
 */
export function shortcutOverridesFromSettings(settings: WorkspaceSettings): ShortcutOverrides {
  const overrides = storedShortcutOverrides(settings);
  if (!quitShortcutEnabled(settings)) {
    overrides[QUIT_ACTION_ID] = null;
  }
  return overrides;
}

/**
 * @name quitCombo
 * @description The combo that quits the app, or null while the Quit shortcut is
 * switched off.
 *
 * @example
 * const combo = quitCombo(overrides);
 */
export function quitCombo(overrides: ShortcutOverrides): string | null {
  if (overrides[QUIT_ACTION_ID] === null) {
    return null;
  }
  return effectiveShortcutKeys(shortcutDefinition(QUIT_ACTION_ID), overrides);
}

/**
 * @name shortcutShadowedByQuit
 * @description Whether one of an action's combos collides with the live Quit
 * combo. Quit is destructive, so it always wins: the other action stays unbound
 * on that combo until one of the two is rebound.
 *
 * @example
 * if (shortcutShadowedByQuit(definition, definition.secondaryKeys, overrides)) {
 *   return;
 * }
 */
export function shortcutShadowedByQuit(
  definition: ShortcutDefinition,
  keys: string,
  overrides: ShortcutOverrides,
): boolean {
  if (definition.id === QUIT_ACTION_ID || isKeySequence(keys)) {
    return false;
  }
  const quit = quitCombo(overrides);
  return quit !== null && sameCombo(keys, quit);
}

export function sameShortcutOverrides(left: ShortcutOverrides, right: ShortcutOverrides): boolean {
  const leftKeys = Object.keys(left) as (keyof ShortcutOverrides)[];
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

/** A definition's any-of scopes, normalised to a list. */
export function shortcutScopeList(definition: ShortcutDefinition): readonly string[] {
  if (definition.scopes === undefined) {
    return [];
  }
  return typeof definition.scopes === "string" ? [definition.scopes] : definition.scopes;
}

/**
 * Whether `active` satisfies a definition's scope gates: at least one of
 * `scopes` and every one of `allScopes`.
 */
export function shortcutScopesActive(
  definition: ShortcutDefinition,
  active: ReadonlySet<string>,
): boolean {
  const anyOf = shortcutScopeList(definition);
  if (anyOf.length > 0 && !anyOf.some((scope) => active.has(scope))) {
    return false;
  }
  return (definition.allScopes ?? []).every((scope) => active.has(scope));
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
  const override = overrides[definition.id];
  if (override === null) {
    return false;
  }
  if (override !== undefined) {
    return true;
  }
  return definition.platforms === undefined || definition.platforms.includes(platform);
}

export type ShortcutConflict = {
  actionId: ShortcutActionId;
  label: string;
  /** Which of the action's combos the new binding collides with. */
  slot: "primary" | "secondary";
};

/**
 * Every combo an action answers to on `platform`: its effective primary plus
 * its alternate. Sequences are included, so rebinding onto the first chord of a
 * sequence is not mistaken for a free combo. A switched-off primary is left out.
 */
export function shortcutCombos(
  definition: ShortcutDefinition,
  overrides: ShortcutOverrides,
): readonly { keys: string; slot: "primary" | "secondary" }[] {
  const combos: { keys: string; slot: "primary" | "secondary" }[] = [];
  if (overrides[definition.id] !== null) {
    combos.push({ keys: effectiveShortcutKeys(definition, overrides), slot: "primary" });
  }
  if (definition.secondaryKeys) {
    combos.push({ keys: definition.secondaryKeys, slot: "secondary" });
  }
  return combos;
}

/**
 * A combo rendered the way `@remcostoeten/use-shortcut` keys its registry:
 * modifiers in ctrl/alt/shift/cmd order, lowercased key, sequence steps joined
 * by a space. Lets a conflict payload from the library be matched back to the
 * definitions that produced it.
 */
export function normalizeRegistryCombo(keys: string): string {
  return keys
    .split(" then ")
    .map((step) => {
      const parsed = parseShortcut(step);
      const parts: string[] = [];
      if (parsed.modifiers.ctrl) {
        parts.push("ctrl");
      }
      if (parsed.modifiers.alt) {
        parts.push("alt");
      }
      if (parsed.modifiers.shift) {
        parts.push("shift");
      }
      if (parsed.modifiers.meta) {
        parts.push("cmd");
      }
      const key =
        parsed.key === " " || parsed.key === "Spacebar" ? "space" : parsed.key.toLowerCase();
      return [...parts, key].join("+");
    })
    .join(" ");
}

function scopesDisjoint(left: ShortcutDefinition, right: ShortcutDefinition): boolean {
  const leftScopes = shortcutScopeList(left);
  const rightScopes = shortcutScopeList(right);
  if (leftScopes.length === 0 || rightScopes.length === 0) {
    return false;
  }
  return !leftScopes.some((scope) => rightScopes.includes(scope));
}

/**
 * Predicate over a pair of registry combos: true when no action claiming the
 * first can ever be live at the same time as one claiming the second, because
 * their scope gates never overlap.
 *
 * The shortcut library compares combos without consulting scopes, so it reports
 * deliberately scope-separated bindings — `/` focusing the editor on the notes
 * route and searching entries on the journal — as conflicts on every
 * registration pass. Use this to drop those without losing real collisions.
 */
export function scopeSeparatedConflicts(
  overrides: ShortcutOverrides,
): (combo: string, existingCombo: string) => boolean {
  const claimants = new Map<string, ShortcutDefinition[]>();
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.boundInEditor) {
      continue;
    }
    for (const combo of shortcutCombos(definition, overrides)) {
      const normalized = normalizeRegistryCombo(combo.keys);
      const existing = claimants.get(normalized);
      if (existing) {
        existing.push(definition);
      } else {
        claimants.set(normalized, [definition]);
      }
    }
  }

  return function isScopeSeparated(combo: string, existingCombo: string): boolean {
    const left = claimants.get(combo);
    const right = claimants.get(existingCombo);
    if (!left || !right) {
      return false;
    }
    return left.every((first) =>
      right.every((second) => first.id === second.id || scopesDisjoint(first, second)),
    );
  };
}

/**
 * The action whose effective binding already uses `combo`, excluding the
 * action being rebound. Null means the combo is free to assign. Alternates
 * count: an action that also answers to `mod+delete` owns that combo just as
 * firmly as its primary, so handing it to a second action would double-fire.
 *
 * Ownership is global, deliberately: a combo the user rebinds should mean one
 * thing everywhere, so a scope-disjoint holder still counts as taken even
 * though the two could never fire against each other.
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
    for (const candidate of shortcutCombos(definition, overrides)) {
      if (sameCombo(candidate.keys, combo)) {
        return { actionId: definition.id, label: definition.label, slot: candidate.slot };
      }
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
    override === undefined || override === null || sameCombo(override, defaultKeys(definition))
  );
}
