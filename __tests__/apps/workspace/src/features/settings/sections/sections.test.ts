import assert from "node:assert/strict";
import { test } from "vitest";
import {
  SECTIONS,
  availableSettingsSections,
  groupSettingsSections,
} from "@/features/settings/sections/sections";
import { filterSettingsSections } from "@/features/settings/settings-navigation";

test("the sidebar splits into everyday preferences and account, safety, and data", () => {
  const groups = groupSettingsSections(availableSettingsSections(true, false, ""));
  assert.deepEqual(
    groups.top.map((section) => section.id),
    ["appearance", "editor", "ai", "shortcuts", "media"],
  );
  assert.deepEqual(
    groups.bottom.map((section) => section.id),
    ["account", "lock", "data", "about"],
  );
});

test("grouping preserves the flat order used by keyboard navigation", () => {
  const sections = availableSettingsSections(true, false, "");
  const groups = groupSettingsSections(sections);
  assert.deepEqual(
    [...groups.top, ...groups.bottom].map((section) => section.id),
    sections.map((section) => section.id),
  );
});

test("AI and desktop-only sections are gated by setting and runtime", () => {
  function ids(aiEnabled: boolean, browserRuntime: boolean) {
    return availableSettingsSections(aiEnabled, browserRuntime, "").map((section) => section.id);
  }
  assert.equal(ids(false, false).includes("ai"), false);
  assert.equal(ids(true, false).includes("ai"), true);
  assert.equal(ids(true, false).includes("media"), true);
  assert.equal(
    ids(true, true).includes("ai"),
    false,
    "AI has no browser implementation: neither Ollama nor a provider key store",
  );
  assert.equal(ids(true, true).includes("media"), false);
  for (const section of SECTIONS) {
    if (section.id === "ai" || section.id === "media") {
      assert.ok(
        "desktopOnly" in section && section.desktopOnly,
        `${section.id} must declare its runtime requirement on the section`,
      );
    }
  }
});

test("the stored empty-note prompt is searchable alongside the static terms", () => {
  const sections = availableSettingsSections(false, false, "Vandaag schrijf ik");
  assert.deepEqual(
    filterSettingsSections(sections, "vandaag schrijf").map((section) => section.id),
    ["editor"],
  );
  assert.deepEqual(
    filterSettingsSections(sections, "placeholder").map((section) => section.id),
    ["editor"],
  );
  assert.deepEqual(
    filterSettingsSections(availableSettingsSections(false, false, "Start writing..."), "vandaag"),
    [],
  );
});
