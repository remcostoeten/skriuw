import assert from "node:assert/strict";
import test from "node:test";
import { SECTIONS } from "../../../src/shell/settings/sections";

test("SECTIONS contains all expected settings section definitions", () => {
  const ids = SECTIONS.map((section) => section.id);
  assert.deepEqual(ids, ["appearance", "editor", "shortcuts", "media", "data", "about"]);
});

test("each section has label, description, searchText and icon", () => {
  for (const section of SECTIONS) {
    assert.ok(section.label.length > 0);
    assert.ok(section.description.length > 0);
    assert.ok(section.searchText.length > 0);
    assert.equal(typeof section.icon, "function");
  }
});
