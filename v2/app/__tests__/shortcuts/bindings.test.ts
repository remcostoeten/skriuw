import assert from "node:assert/strict";
import test from "node:test";
import { parseShortcut } from "@remcostoeten/use-shortcut/parser";
import type { WorkspaceSettings } from "../../src/contracts/workspace";
import {
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  sameCombo,
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
