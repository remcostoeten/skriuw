import assert from "node:assert/strict";
import test from "node:test";
import {
  activeShortcutScopes,
  shortcutDefinitionsForState,
} from "../../src/shortcuts/workspace-shortcuts";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";

test("suspended shortcuts retain only the explicitly active binding", () => {
  assert.deepEqual(shortcutDefinitionsForState(true), []);
  assert.deepEqual(
    shortcutDefinitionsForState(true, "openSettings").map((definition) => definition.id),
    ["openSettings"],
  );
  assert.deepEqual(
    shortcutDefinitionsForState(false),
    SHORTCUT_DEFINITIONS.filter((definition) => !definition.boundInEditor),
  );
});

test("the tabs scope needs the notes route and the tabbed workspace switched on", () => {
  assert.deepEqual(activeShortcutScopes("notes", false, true, false), ["note-create", "tabs"]);
  assert.deepEqual(activeShortcutScopes("notes", false, false, false), ["note-create"]);
  assert.deepEqual(activeShortcutScopes("notes", true, true, false), [
    "note-create",
    "note-focus",
    "tabs",
  ]);
  assert.deepEqual(activeShortcutScopes("tags", false, true, true), ["tags-route"]);
  assert.deepEqual(activeShortcutScopes("trash", false, true, true), ["note-create"]);
});

test("the journal scope follows the journal route and nothing else", () => {
  assert.deepEqual(activeShortcutScopes("journal", false, true, true), ["journal"]);
  assert.deepEqual(activeShortcutScopes("notes", false, false, false), ["note-create"]);
  assert.deepEqual(activeShortcutScopes("people", false, false, false), []);
});

test("the split scope needs the notes route and a second pane", () => {
  assert.deepEqual(activeShortcutScopes("notes", false, false, true), [
    "note-create",
    "split",
  ]);
  assert.deepEqual(activeShortcutScopes("notes", false, true, true), [
    "note-create",
    "tabs",
    "split",
  ]);
  assert.deepEqual(activeShortcutScopes("people", false, true, true), []);
});
