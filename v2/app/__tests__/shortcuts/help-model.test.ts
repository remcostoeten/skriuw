import assert from "node:assert/strict";
import test from "node:test";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";
import type { ShortcutDefinition } from "../../src/shortcuts/definitions";
import {
  shortcutHelpCombos,
  shortcutHelpGroups,
  shortcutHelpMatches,
  shortcutHelpRow,
  shortcutHelpRowCount,
  shortcutWhenLabel,
} from "../../src/shortcuts/help-model";

function definition(id: string): ShortcutDefinition {
  const found = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
  assert.ok(found, `${id} has no definition`);
  return found;
}

function rowFor(id: string, platform: "mac" | "windows" | "linux" = "linux") {
  const row = shortcutHelpRow(definition(id), {}, platform);
  assert.ok(row, `${id} produced no row`);
  return row;
}

test("every group in the definitions shows up, in definition order", () => {
  const groups = shortcutHelpGroups({ overrides: {}, platform: "linux" });
  const expected = [
    ...new Set(SHORTCUT_DEFINITIONS.map((entry) => entry.group)),
  ].filter((group) =>
    SHORTCUT_DEFINITIONS.some(
      (entry) =>
        entry.group === group && shortcutHelpCombos(entry, {}, "linux").length > 0,
    ),
  );
  assert.deepEqual(
    groups.map((group) => group.group),
    expected,
  );
  assert.equal(
    shortcutHelpRowCount(groups),
    SHORTCUT_DEFINITIONS.filter(
      (entry) => shortcutHelpCombos(entry, {}, "linux").length > 0,
    ).length,
  );
});

test("rows render the effective combo, not the default, when the user rebinds", () => {
  const groups = shortcutHelpGroups({
    overrides: { createNote: "mod+alt+n" },
    platform: "linux",
    query: "new note",
  });
  const row = groups.flatMap((group) => group.rows).find((entry) => entry.id === "createNote");
  assert.ok(row);
  assert.deepEqual(
    row.combos.map((combo) => combo.keys),
    ["mod+alt+n"],
  );
  assert.deepEqual(row.combos[0]?.steps, ["Alt+Ctrl+N"]);
});

test("a definition with an alternate lists both bindings", () => {
  const row = rowFor("findAndReplaceInNote");
  assert.deepEqual(
    row.combos.map((combo) => combo.keys),
    ["mod+h", "mod+alt+f"],
  );
  assert.deepEqual(
    row.combos.map((combo) => combo.sequence),
    [false, false],
  );
});

test("sequence alternates keep one display step per key", () => {
  const row = rowFor("goToTags");
  const sequence = row.combos.find((combo) => combo.sequence);
  assert.ok(sequence);
  assert.equal(sequence.keys, "g then t then 3");
  assert.deepEqual(sequence.steps, ["G", "T", "3"]);
  const chord = row.combos.find((combo) => !combo.sequence);
  assert.ok(chord);
  assert.equal(chord.steps.length, 1);
});

test("bindings that do not bind on this platform are dropped", () => {
  assert.equal(shortcutHelpRow(definition("goToDocumentStart"), {}, "mac"), null);
  assert.ok(shortcutHelpRow(definition("goToDocumentStart"), {}, "windows"));
  assert.ok(
    shortcutHelpRow(
      definition("goToDocumentStart"),
      { goToDocumentStart: "mod+alt+arrowup" },
      "mac",
    ),
  );
  const macGroups = shortcutHelpGroups({ overrides: {}, platform: "mac" });
  assert.equal(
    macGroups
      .flatMap((group) => group.rows)
      .some((row) => row.id === "goToDocumentEnd"),
    false,
  );
});

test("the when column is derived from scopes, guards, and editor binding", () => {
  assert.equal(shortcutWhenLabel(definition("jumpToLine")), "In the editor · Markdown mode");
  assert.equal(shortcutWhenLabel(definition("focusPaneRight")), "Split view");
  assert.equal(shortcutWhenLabel(definition("openTab3")), "Tabs open");
  assert.equal(shortcutWhenLabel(definition("findInNote")), "Editor focused");
  assert.equal(shortcutWhenLabel(definition("createTag")), "Tags view");
  assert.equal(
    shortcutWhenLabel(definition("trashCurrentNote")),
    "Outside text fields · Outside the sidebar tree",
  );
  assert.equal(shortcutWhenLabel(definition("toggleCommandPalette")), undefined);
  assert.equal(shortcutWhenLabel(definition("showShortcutHelp")), undefined);
});

test("a plain-key binding that cannot fire while typing says so", () => {
  const plainKey: ShortcutDefinition = {
    id: "createNote",
    keys: "r",
    label: "Rename",
    group: "Workspace",
  };
  assert.equal(shortcutWhenLabel(plainKey), "Not while typing");
});

test("the filter matches labels, combos, groups, and when copy", () => {
  const row = rowFor("toggleCommandPalette");
  assert.equal(shortcutHelpMatches("General", row, ""), true);
  assert.equal(shortcutHelpMatches("General", row, "  "), true);
  assert.equal(shortcutHelpMatches("General", row, "PALETTE"), true);
  assert.equal(shortcutHelpMatches("General", row, "mod+k"), true);
  assert.equal(shortcutHelpMatches("General", row, "modk"), true);
  assert.equal(shortcutHelpMatches("General", row, "Ctrl+K"), true);
  assert.equal(shortcutHelpMatches("General", row, "general"), true);
  assert.equal(shortcutHelpMatches("General", row, "duplicate"), false);
  assert.equal(shortcutHelpMatches("Editor", rowFor("jumpToLine"), "markdown mode"), true);
});

test("filtering drops emptied groups and keeps matching rows only", () => {
  const groups = shortcutHelpGroups({
    overrides: {},
    platform: "linux",
    query: "tab",
  });
  assert.ok(groups.length > 0);
  assert.equal(
    groups.every((group) => group.rows.length > 0),
    true,
  );
  assert.equal(
    groups.flatMap((group) => group.rows).some((row) => row.id === "zoomIn"),
    false,
  );
  assert.equal(
    shortcutHelpRowCount(
      shortcutHelpGroups({ overrides: {}, platform: "linux", query: "no such key" }),
    ),
    0,
  );
});
