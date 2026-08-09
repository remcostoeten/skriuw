import assert from "node:assert/strict";
import test from "node:test";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";
import type { ShortcutDefinition } from "../../src/shortcuts/definitions";
import {
  filterShortcutSettings,
  shortcutSearchSuggestions,
  shortcutSettingsCount,
  shortcutSettingsMatches,
} from "../../src/shortcuts/settings-search";

function definition(id: string): ShortcutDefinition {
  const found = SHORTCUT_DEFINITIONS.find((entry) => entry.id === id);
  assert.ok(found, `${id} has no definition`);
  return found;
}

test("an empty query keeps every definition, grouped in definition order", () => {
  const groups = filterShortcutSettings({}, "");
  assert.deepEqual(
    groups.map((group) => group.group),
    [...new Set(SHORTCUT_DEFINITIONS.map((entry) => entry.group))],
  );
  assert.equal(shortcutSettingsCount(groups), SHORTCUT_DEFINITIONS.length);
});

test("matches the label, case-insensitively", () => {
  assert.ok(shortcutSettingsMatches(definition("createNote"), {}, "new NOTE"));
  assert.ok(!shortcutSettingsMatches(definition("createNote"), {}, "zoom"));
});

test("matches the group and the description", () => {
  assert.ok(shortcutSettingsMatches(definition("journalToday"), {}, "journal"));
  assert.ok(shortcutSettingsMatches(definition("showShortcutHelp"), {}, "cheat sheet"));
});

test("matches the combo with mod spelled as ctrl or cmd, plus optional", () => {
  const palette = definition("toggleCommandPalette");
  assert.ok(shortcutSettingsMatches(palette, {}, "mod+k"));
  assert.ok(shortcutSettingsMatches(palette, {}, "ctrl k"));
  assert.ok(shortcutSettingsMatches(palette, {}, "cmdk"));
});

test("matches a user override instead of the replaced default", () => {
  const overrides = { toggleCommandPalette: "mod+shift+x" };
  const palette = definition("toggleCommandPalette");
  assert.ok(shortcutSettingsMatches(palette, overrides, "shift x"));
  assert.ok(!shortcutSettingsMatches(palette, overrides, "mod+k"));
});

test("matches the secondary combo", () => {
  assert.ok(shortcutSettingsMatches(definition("trashCurrentNote"), {}, "mod+delete"));
});

test("filtering drops groups the query leaves empty", () => {
  const groups = filterShortcutSettings({}, "quit");
  assert.deepEqual(
    groups.map((group) => group.group),
    ["General"],
  );
  assert.deepEqual(
    groups[0]?.definitions.map((entry) => entry.id),
    ["quitApp"],
  );
});

test("suggestions are empty for a blank query", () => {
  assert.deepEqual(shortcutSearchSuggestions({}, ""), []);
  assert.deepEqual(shortcutSearchSuggestions({}, "   "), []);
});

test("suggestions rank label-prefix matches first and cap the list", () => {
  const suggestions = shortcutSearchSuggestions({}, "go to");
  assert.ok(suggestions.length <= 8);
  assert.ok(suggestions[0]?.toLowerCase().startsWith("go to"));
  assert.ok(suggestions.every((label) => typeof label === "string" && label.length > 0));
});

test("an accepted suggestion produces no further suggestions", () => {
  const [first] = shortcutSearchSuggestions({}, "zoom i");
  assert.equal(first, "Zoom in");
  assert.deepEqual(shortcutSearchSuggestions({}, "Zoom in"), []);
});

test("suggestions follow the filter, so a combo query suggests its shortcut", () => {
  const suggestions = shortcutSearchSuggestions({}, "ctrl+shift+pageup");
  assert.deepEqual(suggestions, ["Move tab left"]);
});
