import assert from "node:assert/strict";
import test from "node:test";
import { matchesShortcut, parseShortcut } from "@remcostoeten/use-shortcut/parser";
import type { WorkspaceSettings } from "../../src/contracts/workspace";
import {
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  sameCombo,
  shortcutBindsOnPlatform,
  shortcutExcept,
  shortcutGuarded,
  shortcutGuards,
  shortcutOverridesFromSettings,
} from "../../src/shortcuts/bindings";
import {
  SHORTCUT_DEFINITIONS,
  TAB_INDEX_ACTION_IDS,
} from "../../src/shortcuts/definitions";

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

test("document edge jumps are editor-bound, rebindable, and conflict-free", () => {
  for (const [id, keys] of [
    ["goToDocumentStart", "ctrl+arrowup"],
    ["goToDocumentEnd", "ctrl+arrowdown"],
  ] as const) {
    const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
    assert.ok(definition);
    assert.equal(effectiveShortcutKeys(definition, {}), keys);
    assert.equal(definition.boundInEditor, true);
    assert.deepEqual(shortcutGuards(definition, true), []);
    assert.equal(findShortcutConflict({}, id, keys), null);
    assert.ok((definition.description ?? "").includes("VS Code"));
  }
});

test("the ctrl+arrow document edge defaults stay off macOS but a rebind binds everywhere", () => {
  const definition = SHORTCUT_DEFINITIONS.find(
    (entry) => entry.id === "goToDocumentStart",
  );
  assert.ok(definition);
  assert.equal(shortcutBindsOnPlatform(definition, {}, "linux"), true);
  assert.equal(shortcutBindsOnPlatform(definition, {}, "windows"), true);
  assert.equal(shortcutBindsOnPlatform(definition, {}, "mac"), false);
  assert.equal(
    shortcutBindsOnPlatform(definition, { goToDocumentStart: "mod+alt+arrowup" }, "mac"),
    true,
  );
});

test("a binding without a platform list registers on every platform", () => {
  const createNote = SHORTCUT_DEFINITIONS.find((entry) => entry.id === "createNote");
  assert.ok(createNote);
  for (const platform of ["mac", "windows", "linux"] as const) {
    assert.equal(shortcutBindsOnPlatform(createNote, {}, platform), true);
  }
});

test("ctrl+arrowup and ctrl+arrowdown match only with ctrl held", () => {
  const base = { key: "ArrowUp", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  const pressed = (key: string) =>
    ({ ...base, key, ctrlKey: true }) as unknown as KeyboardEvent;
  assert.equal(matchesShortcut(pressed("ArrowUp"), parseShortcut("ctrl+arrowup")), true);
  assert.equal(matchesShortcut(pressed("ArrowDown"), parseShortcut("ctrl+arrowdown")), true);
  assert.equal(
    matchesShortcut(base as unknown as KeyboardEvent, parseShortcut("ctrl+arrowup")),
    false,
  );
  assert.equal(
    matchesShortcut(
      { ...base, ctrlKey: true, altKey: true } as unknown as KeyboardEvent,
      parseShortcut("ctrl+arrowup"),
    ),
    false,
  );
});

test("find and replace shares the find scope and adds a macOS-safe alternate", () => {
  const findAndReplace = SHORTCUT_DEFINITIONS.find(
    (entry) => entry.id === "findAndReplaceInNote",
  );
  const findInNote = SHORTCUT_DEFINITIONS.find((entry) => entry.id === "findInNote");
  assert.ok(findAndReplace);
  assert.ok(findInNote);
  assert.equal(effectiveShortcutKeys(findAndReplace, {}), "mod+h");
  assert.equal(findAndReplace.secondaryKeys, "mod+alt+f");
  assert.equal(findAndReplace.secondaryWorksWhileTyping, true);
  assert.equal(findAndReplace.scopes, findInNote.scopes);
  assert.deepEqual(shortcutGuards(findAndReplace, true), []);
  assert.equal(findShortcutConflict({}, "findAndReplaceInNote", "mod+h"), null);
  assert.equal(
    findShortcutConflict({}, "findAndReplaceInNote", "mod+f")?.actionId,
    "findInNote",
  );
});

test("mod+h matches find and replace while a plain h keeps typing", () => {
  const parsed = parseShortcut("mod+h");
  const modifier = parseShortcut("mod+k").modifiers.meta ? "metaKey" : "ctrlKey";
  const base = { key: "h", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  assert.equal(
    matchesShortcut({ ...base, [modifier]: true } as unknown as KeyboardEvent, parsed),
    true,
  );
  assert.equal(matchesShortcut(base as unknown as KeyboardEvent, parsed), false);
  assert.equal(
    matchesShortcut(
      { ...base, key: "f", [modifier]: true, altKey: true } as unknown as KeyboardEvent,
      parseShortcut("mod+alt+f"),
    ),
    true,
  );
});

test("jump to line is scoped to Markdown mode and bound inside the editor", () => {
  const jumpToLine = SHORTCUT_DEFINITIONS.find((entry) => entry.id === "jumpToLine");
  assert.ok(jumpToLine);
  assert.equal(effectiveShortcutKeys(jumpToLine, {}), "mod+g");
  assert.equal(jumpToLine.scopes, "markdown");
  assert.equal(jumpToLine.boundInEditor, true);
  assert.deepEqual(shortcutGuards(jumpToLine, true), []);
  assert.equal(findShortcutConflict({}, "jumpToLine", "mod+g"), null);
});

test("mod+g matches jump to line and a plain g keeps typing", () => {
  const parsed = parseShortcut("mod+g");
  const modifier = parseShortcut("mod+k").modifiers.meta ? "metaKey" : "ctrlKey";
  const base = { key: "g", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  assert.equal(
    matchesShortcut({ ...base, [modifier]: true } as unknown as KeyboardEvent, parsed),
    true,
  );
  assert.equal(matchesShortcut(base as unknown as KeyboardEvent, parsed), false);
  assert.equal(
    matchesShortcut(
      { ...base, [modifier]: true, shiftKey: true } as unknown as KeyboardEvent,
      parsed,
    ),
    false,
  );
});

test("every default binding is free of overlaps", () => {
  for (const definition of SHORTCUT_DEFINITIONS) {
    assert.equal(
      findShortcutConflict({}, definition.id, effectiveShortcutKeys(definition, {})),
      null,
      `${definition.id} overlaps another default`,
    );
  }
});

test("tab access is generated for every digit and scoped to the tabbed workspace", () => {
  const ids = [...TAB_INDEX_ACTION_IDS, "openLastTab"] as const;
  assert.equal(TAB_INDEX_ACTION_IDS.length, 9);
  for (const [index, id] of ids.entries()) {
    const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
    assert.ok(definition, `${id} has no definition`);
    assert.equal(
      effectiveShortcutKeys(definition, {}),
      id === "openLastTab" ? "alt+0" : `alt+${index + 1}`,
    );
    assert.equal(definition.group, "Tabs");
    assert.equal(definition.scopes, "tabs");
    assert.deepEqual(shortcutGuards(definition, true), ["modal"]);
    assert.equal(findShortcutConflict({}, id, effectiveShortcutKeys(definition, {})), null);
  }
});

test("tab access uses alt digits so it never collides with the mod digit bindings", () => {
  for (const [id, keys] of [
    ["focusEditor", "mod+2"],
    ["focusMetadata", "mod+3"],
    ["zoomReset", "mod+0"],
  ] as const) {
    const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
    assert.ok(definition);
    assert.equal(effectiveShortcutKeys(definition, {}), keys);
    assert.equal(findShortcutConflict({}, id, keys), null);
  }
  assert.equal(sameCombo("alt+2", "mod+2"), false);
  assert.equal(sameCombo("alt+0", "mod+0"), false);
});

test("alt+4 matches the fourth tab binding and a bare 4 keeps typing", () => {
  const parsed = parseShortcut("alt+4");
  const base = { key: "4", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  assert.equal(
    matchesShortcut({ ...base, altKey: true } as unknown as KeyboardEvent, parsed),
    true,
  );
  assert.equal(matchesShortcut(base as unknown as KeyboardEvent, parsed), false);
  assert.equal(
    matchesShortcut(
      { ...base, altKey: true, shiftKey: true } as unknown as KeyboardEvent,
      parsed,
    ),
    false,
  );
});

test("tab management binds reopen and the two move keys, scoped to the tabbed workspace", () => {
  for (const [id, keys] of [
    ["reopenClosedTab", "mod+shift+w"],
    ["moveTabLeft", "ctrl+shift+pageup"],
    ["moveTabRight", "ctrl+shift+pagedown"],
  ] as const) {
    const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
    assert.ok(definition, `${id} has no definition`);
    assert.equal(effectiveShortcutKeys(definition, {}), keys);
    assert.equal(definition.group, "Tabs");
    assert.equal(definition.scopes, "tabs");
    assert.deepEqual(shortcutGuards(definition, true), ["modal"]);
    assert.equal(findShortcutConflict({}, id, keys), null);
  }
});

test("reopen closed tab stays off ctrl+shift+t because New tag owns it", () => {
  const createTag = SHORTCUT_DEFINITIONS.find((entry) => entry.id === "createTag");
  assert.ok(createTag);
  assert.equal(effectiveShortcutKeys(createTag, {}), "mod+shift+t");
  assert.equal(
    findShortcutConflict({}, "reopenClosedTab", "mod+shift+t")?.actionId,
    "createTag",
  );
  const closeTab = SHORTCUT_DEFINITIONS.find((entry) => entry.id === "closeTab");
  assert.ok(closeTab);
  assert.equal(sameCombo(effectiveShortcutKeys(closeTab, {}), "mod+shift+w"), false);
});

test("mod+shift+w and ctrl+shift+pageup match their tab management bindings", () => {
  const modifier = parseShortcut("mod+k").modifiers.meta ? "metaKey" : "ctrlKey";
  const base = { key: "w", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  assert.equal(
    matchesShortcut(
      { ...base, shiftKey: true, [modifier]: true } as unknown as KeyboardEvent,
      parseShortcut("mod+shift+w"),
    ),
    true,
  );
  assert.equal(
    matchesShortcut(
      { ...base, [modifier]: true } as unknown as KeyboardEvent,
      parseShortcut("mod+shift+w"),
    ),
    false,
  );
  assert.equal(
    matchesShortcut(
      { ...base, key: "PageUp", ctrlKey: true, shiftKey: true } as unknown as KeyboardEvent,
      parseShortcut("ctrl+shift+pageup"),
    ),
    true,
  );
  assert.equal(
    matchesShortcut(
      { ...base, key: "PageDown", ctrlKey: true, shiftKey: true } as unknown as KeyboardEvent,
      parseShortcut("ctrl+shift+pagedown"),
    ),
    true,
  );
});
