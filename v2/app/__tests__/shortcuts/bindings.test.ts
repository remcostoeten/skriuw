import assert from "node:assert/strict";
import test from "node:test";
import { matchesShortcut, parseShortcut } from "@remcostoeten/use-shortcut/parser";
import type { WorkspaceSettings } from "../../src/contracts/workspace";
import {
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  sameCombo,
  shortcutExcept,
  shortcutGuarded,
  shortcutGuards,
  shortcutOverridesFromSettings,
} from "../../src/shortcuts/bindings";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";

const platformModifier = parseShortcut("mod+k").modifiers.meta ? "meta" : "ctrl";
const otherModifier = platformModifier === "meta" ? "ctrl" : "meta";

function settingsWith(overrides: unknown): WorkspaceSettings {
  return {
    settingsVersion: 1,
    theme: "system",
    compactSidebar: false,
    showPageIcons: true,
    reduceMotion: false,
    rememberLastNote: true,
    editorFont: "sans",
    editorLineHeight: "1.6",
    showLineNumbers: false,
    editorPlaceholder: "Start writing",
    shortcutOverrides: overrides,
  };
}

test("sameCombo ignores case, spacing, and modifier order", () => {
  assert.equal(sameCombo("Shift + MOD + K", "mod+shift+k"), true);
  assert.equal(sameCombo("K", "k"), true);
  assert.equal(sameCombo("mod+k", "mod+j"), false);
  assert.equal(sameCombo("mod+k", "mod+shift+k"), false);
});

test("sameCombo resolves mod to the platform modifier like the runtime matcher", () => {
  assert.equal(sameCombo("mod+k", `${platformModifier}+k`), true);
  assert.equal(sameCombo("mod+k", `${otherModifier}+k`), false);
});

test("overrides from settings keep known actions and drop junk", () => {
  const overrides = shortcutOverridesFromSettings(
    settingsWith({ createNote: "mod+alt+n", unknownAction: "mod+x", createFolder: 3 }),
  );
  assert.deepEqual(overrides, { createNote: "mod+alt+n" });
  assert.deepEqual(shortcutOverridesFromSettings(settingsWith(null)), {});
});

test("effective keys prefer the override and fall back to the definition", () => {
  const createNote = SHORTCUT_DEFINITIONS.find((definition) => definition.id === "createNote");
  assert.ok(createNote);
  assert.equal(effectiveShortcutKeys(createNote, { createNote: "mod+alt+n" }), "mod+alt+n");
  assert.equal(effectiveShortcutKeys(createNote, {}), "mod+n");
});

test("focus sidebar defaults to returning to the current note", () => {
  const focusSidebar = SHORTCUT_DEFINITIONS.find(
    (definition) => definition.id === "focusSidebar",
  );
  assert.ok(focusSidebar);
  assert.equal(effectiveShortcutKeys(focusSidebar, {}), "mod+e");
});

test("conflicts are detected against effective bindings, not just defaults", () => {
  assert.equal(
    findShortcutConflict({}, "createNote", "mod+shift+n")?.actionId,
    "createFolder",
  );
  assert.equal(findShortcutConflict({}, "createNote", "MOD + Shift + N")?.actionId, "createFolder");
  assert.equal(
    findShortcutConflict({}, "createNote", `${platformModifier}+shift+n`)?.actionId,
    "createFolder",
  );
  assert.equal(findShortcutConflict({}, "createNote", "mod+alt+n"), null);
  assert.equal(
    findShortcutConflict({ createFolder: "mod+alt+f" }, "createNote", "mod+shift+n"),
    null,
  );
  assert.equal(
    findShortcutConflict({ createFolder: "mod+alt+f" }, "createNote", "mod+alt+f")?.actionId,
    "createFolder",
  );
});

test("default binding detection treats an equal override as default", () => {
  const createNote = SHORTCUT_DEFINITIONS.find((definition) => definition.id === "createNote");
  assert.ok(createNote);
  assert.equal(isDefaultBinding(createNote, {}), true);
  assert.equal(isDefaultBinding(createNote, { createNote: "MOD+N" }), true);
  assert.equal(isDefaultBinding(createNote, { createNote: `${platformModifier}+n` }), true);
  assert.equal(isDefaultBinding(createNote, { createNote: "mod+alt+n" }), false);
});

test("guards default to blocking typing unless the definition opts out", () => {
  const findInNote = SHORTCUT_DEFINITIONS.find((entry) => entry.id === "findInNote");
  const searchMatchCase = SHORTCUT_DEFINITIONS.find(
    (entry) => entry.id === "searchMatchCase",
  );
  assert.ok(findInNote);
  assert.ok(searchMatchCase);
  assert.deepEqual(shortcutGuards(findInNote, true), []);
  assert.deepEqual(shortcutGuards(findInNote, false), ["typing"]);
  assert.equal(shortcutExcept(findInNote, true), undefined);
  assert.equal(typeof shortcutExcept(findInNote, false), "function");
});

test("rename current note defers to text fields, the sidebar tree, and modals", () => {
  const renameCurrentNote = SHORTCUT_DEFINITIONS.find(
    (entry) => entry.id === "renameCurrentNote",
  );
  assert.ok(renameCurrentNote);
  assert.equal(effectiveShortcutKeys(renameCurrentNote, {}), "f2");
  assert.deepEqual(shortcutGuards(renameCurrentNote, true), [
    "textField",
    "sidebarTree",
    "modal",
  ]);
  assert.equal(findShortcutConflict({}, "renameCurrentNote", "f2"), null);
});

test("guard predicates read the event target's field, tree, and modal context", () => {
  const guards = ["textField", "sidebarTree"] as const;
  const editorTarget = { tagName: "DIV", isContentEditable: true, closest: () => null };
  const inputTarget = { tagName: "INPUT", closest: () => null };
  const treeRow = { tagName: "BUTTON", closest: (selector: string) => ({ selector }) };

  assert.equal(shortcutGuarded(guards, { target: editorTarget }), false);
  assert.equal(shortcutGuarded(guards, { target: inputTarget }), true);
  assert.equal(shortcutGuarded(guards, { target: treeRow }), true);
  assert.equal(shortcutGuarded(guards, { target: null }), false);
  assert.equal(shortcutGuarded(["typing"], { target: editorTarget }), true);
});

test("a plain F2 keypress matches the rename binding", () => {
  const parsed = parseShortcut("f2");
  const pressed = {
    key: "F2",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as KeyboardEvent;
  assert.equal(matchesShortcut(pressed, parsed), true);
  assert.equal(
    matchesShortcut({ ...pressed, shiftKey: true } as KeyboardEvent, parsed),
    false,
  );
});

test("trash current note binds both delete keys and keeps them alive while typing", () => {
  const trashCurrentNote = SHORTCUT_DEFINITIONS.find(
    (entry) => entry.id === "trashCurrentNote",
  );
  assert.ok(trashCurrentNote);
  assert.equal(effectiveShortcutKeys(trashCurrentNote, {}), "mod+backspace");
  assert.equal(trashCurrentNote.secondaryKeys, "mod+delete");
  assert.equal(trashCurrentNote.secondaryWorksWhileTyping, true);
  assert.deepEqual(shortcutGuards(trashCurrentNote, true), [
    "textField",
    "sidebarTree",
    "modal",
  ]);
  assert.equal(findShortcutConflict({}, "trashCurrentNote", "mod+backspace"), null);
  assert.ok((trashCurrentNote.description ?? "").includes("macOS"));
});

test("mod+backspace and mod+delete both match the trash binding", () => {
  const base = { key: "Backspace", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  const modifier = parseShortcut("mod+k").modifiers.meta ? "metaKey" : "ctrlKey";
  const withMod = (key: string) =>
    ({ ...base, key, [modifier]: true }) as unknown as KeyboardEvent;
  assert.equal(matchesShortcut(withMod("Backspace"), parseShortcut("mod+backspace")), true);
  assert.equal(matchesShortcut(withMod("Delete"), parseShortcut("mod+delete")), true);
  assert.equal(
    matchesShortcut(base as unknown as KeyboardEvent, parseShortcut("mod+backspace")),
    false,
  );
});

test("duplicate current note fires from the editor and from the sidebar tree", () => {
  const duplicateCurrentNote = SHORTCUT_DEFINITIONS.find(
    (entry) => entry.id === "duplicateCurrentNote",
  );
  assert.ok(duplicateCurrentNote);
  assert.equal(effectiveShortcutKeys(duplicateCurrentNote, {}), "mod+shift+d");
  assert.deepEqual(shortcutGuards(duplicateCurrentNote, true), ["textField", "modal"]);
  assert.equal(findShortcutConflict({}, "duplicateCurrentNote", "mod+shift+d"), null);

  const guards = shortcutGuards(duplicateCurrentNote, true);
  const treeRow = { tagName: "BUTTON", closest: (selector: string) => ({ selector }) };
  const editorTarget = { tagName: "DIV", isContentEditable: true, closest: () => null };
  const renameInput = { tagName: "INPUT", closest: () => null };
  assert.equal(shortcutGuarded(guards, { target: treeRow }), false);
  assert.equal(shortcutGuarded(guards, { target: editorTarget }), false);
  assert.equal(shortcutGuarded(guards, { target: renameInput }), true);
});

test("mod+shift+d matches the duplicate binding and plain d does not", () => {
  const parsed = parseShortcut("mod+shift+d");
  const modifier = parseShortcut("mod+k").modifiers.meta ? "metaKey" : "ctrlKey";
  const base = { key: "d", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  const pressed = { ...base, shiftKey: true, [modifier]: true } as unknown as KeyboardEvent;
  assert.equal(matchesShortcut(pressed, parsed), true);
  assert.equal(matchesShortcut(base as unknown as KeyboardEvent, parsed), false);
  assert.equal(
    matchesShortcut({ ...base, [modifier]: true } as unknown as KeyboardEvent, parsed),
    false,
  );
});
