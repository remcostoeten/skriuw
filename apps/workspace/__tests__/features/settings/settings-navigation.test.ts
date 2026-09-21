import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSettingsSection,
  filterSettingsSections,
  moveSettingsSection,
  rovingSettingsSection,
  settingsSearchEscape,
} from "../../../src/features/settings/settings-navigation";

const sections = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and density",
    searchText: "compact sidebar page icons reduce motion",
  },
  {
    id: "editor",
    label: "Editor",
    description: "Writing experience",
    searchText: "font line spacing placeholder line numbers",
  },
  {
    id: "data",
    label: "Data",
    description: "Local workspace files",
    searchText: "database storage file manager",
  },
] as const;

test("settings search matches labels, descriptions, deep terms, and multiple tokens", () => {
  assert.deepEqual(
    filterSettingsSections(sections, "appearance").map((section) => section.id),
    ["appearance"],
  );
  assert.deepEqual(
    filterSettingsSections(sections, "writing").map((section) => section.id),
    ["editor"],
  );
  assert.deepEqual(
    filterSettingsSections(sections, "line spacing").map((section) => section.id),
    ["editor"],
  );
  assert.deepEqual(
    filterSettingsSections(sections, "database").map((section) => section.id),
    ["data"],
  );
  assert.deepEqual(filterSettingsSections(sections, "missing"), []);
});

test("roving focus follows the active section or the first visible result", () => {
  assert.equal(rovingSettingsSection(["appearance", "editor"], "editor"), "editor");
  assert.equal(rovingSettingsSection(["editor", "data"], "appearance"), "editor");
  assert.equal(rovingSettingsSection([], "appearance"), undefined);
});

test("active section survives empty search results and stale ids", () => {
  assert.equal(
    activeSettingsSection([], ["appearance", "editor"], "editor"),
    "editor",
  );
  assert.equal(
    activeSettingsSection([], ["appearance", "editor"], "ai"),
    "appearance",
  );
  assert.equal(activeSettingsSection([], [], "appearance"), undefined);
});

test("section navigation wraps and supports Home and End", () => {
  const ids = ["appearance", "editor", "data"] as const;
  assert.equal(moveSettingsSection(ids, "appearance", "ArrowDown"), "editor");
  assert.equal(moveSettingsSection(ids, "appearance", "ArrowUp"), "data");
  assert.equal(moveSettingsSection(ids, "editor", "Home"), "appearance");
  assert.equal(moveSettingsSection(ids, "editor", "End"), "data");
  assert.equal(moveSettingsSection([], "appearance", "ArrowDown"), undefined);
});

test("Escape in the settings search clears the query, then closes the dialog", () => {
  assert.equal(settingsSearchEscape("editor", false), "clear-query");
  assert.equal(settingsSearchEscape("", false), "close-dialog");
  assert.equal(settingsSearchEscape("", true), "ignore");
  assert.equal(settingsSearchEscape("editor", true), "clear-query");
});
