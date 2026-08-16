import assert from "node:assert/strict";
import test from "node:test";
import {
  SECTIONS,
  availableSettingsSections,
} from "../../../../src/features/settings/sections/sections";

test("SECTIONS contains all expected settings section definitions", () => {
  const ids = SECTIONS.map((section) => section.id);
  assert.deepEqual(ids, [
    "appearance",
    "editor",
    "ai",
    "shortcuts",
    "account",
    "media",
    "data",
    "about",
  ]);
});

test("AI and desktop-only sections are structurally gated", () => {
  assert.equal(
    availableSettingsSections(false, false).some((section) => section.id === "ai"),
    false,
  );
  assert.equal(
    availableSettingsSections(true, false).some((section) => section.id === "ai"),
    true,
  );
  assert.equal(
    availableSettingsSections(true, true).some((section) => section.id === "media"),
    false,
  );
});

test("each section has label, description, searchText and icon", () => {
  for (const section of SECTIONS) {
    assert.ok(section.label.length > 0);
    assert.ok(section.description.length > 0);
    assert.ok(section.searchText.length > 0);
    assert.equal(typeof section.icon, "function");
  }
});

test("section labels communicate the preference and recovery groupings", () => {
  assert.equal(SECTIONS.find((section) => section.id === "appearance")?.label, "General");
  assert.equal(SECTIONS.find((section) => section.id === "account")?.label, "Account & sync");
  assert.equal(SECTIONS.find((section) => section.id === "data")?.label, "Data & recovery");
});
