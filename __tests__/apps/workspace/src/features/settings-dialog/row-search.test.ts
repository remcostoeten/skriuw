import assert from "node:assert/strict";
import { test } from "vitest";
import { availableSettingsSections } from "@/features/settings-dialog/sections";
import type { SettingsSection } from "@/features/settings-dialog/sections";
import {
  keywordOnlySections,
  ledgerSearchMatch,
  searchSettingsRows,
  shortcutGroupId,
} from "@/features/settings-dialog/navigation";
import { SETTINGS_SEARCH_GROUPS } from "@/features/settings-dialog/search-copy.generated";

const sections = availableSettingsSections(true, false, "");

function search(query: string) {
  return searchSettingsRows(
    sections,
    (section: SettingsSection) => SETTINGS_SEARCH_GROUPS[section.id],
    query,
  );
}

test("a query finds the single row it names, not its whole section", () => {
  const hits = search("tree guides");
  assert.deepEqual(
    hits.map((hit) => hit.section.id),
    ["appearance"],
  );
  const [hit] = hits;
  assert.deepEqual(
    hit?.groups.map((group) => [group.id, group.wholeGroup, group.rows.map((row) => row.label)]),
    [["sidebar", false, ["Show tree guides"]]],
  );
  assert.equal(hit?.count, 1);
});

test("rows match on their description as well as their label", () => {
  const hits = search("middle of the screen");
  assert.deepEqual(
    hits.flatMap((hit) => hit.groups.flatMap((group) => group.rows.map((row) => row.label))),
    ["Typewriter scrolling"],
  );
});

test("a group whose keywords match keeps every row", () => {
  const [hit] = search("catppuccin");
  assert.equal(hit?.section.id, "appearance");
  assert.deepEqual(
    hit?.groups.map((group) => [group.id, group.wholeGroup]),
    [["theme", true]],
  );
});

test("results keep section order and group rows by section", () => {
  const hits = search("lock");
  assert.ok(hits.length > 0);
  const order = hits.map((hit) => sections.findIndex((section) => section.id === hit.section.id));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );
  assert.ok(hits.some((hit) => hit.section.id === "lock"));
});

test("an empty query has no results", () => {
  assert.deepEqual(search("   "), []);
});

test("sections can add hits of their own, such as the shortcut list", () => {
  const hits = searchSettingsRows(
    sections,
    () => [],
    "palette",
    (section) =>
      section.id === "shortcuts"
        ? [
            {
              id: shortcutGroupId("General"),
              title: "General",
              rows: [{ label: "Open command palette", detail: "" }],
              wholeGroup: true,
            },
          ]
        : [],
  );
  assert.deepEqual(
    hits.map((hit) => [hit.section.id, hit.count]),
    [["shortcuts", 1]],
  );
});

test("the search match lists matched rows per group, or null for a whole group", () => {
  const [hit] = search("tree guides");
  assert.ok(hit);
  const match = ledgerSearchMatch(hit.groups);
  assert.deepEqual([...(match.get("sidebar") ?? [])], ["Show tree guides"]);
  const [theme] = search("catppuccin");
  assert.ok(theme);
  assert.equal(ledgerSearchMatch(theme.groups).get("theme"), null);
});

test("shortcut group ids are stable slugs", () => {
  assert.equal(shortcutGroupId("Editor search"), "shortcuts-editor-search");
  assert.equal(shortcutGroupId("General"), "shortcuts-general");
});

test("the generated index lists each section's groups in render order", () => {
  assert.deepEqual(
    SETTINGS_SEARCH_GROUPS.appearance.map((group) => group.id),
    ["theme", "sidebar", "palette", "workspace", "optional", "preferences"],
  );
  assert.deepEqual(
    SETTINGS_SEARCH_GROUPS.editor.map((group) => group.id),
    ["typography", "writing", "focus", "blocks", "journal", "math"],
  );
  const labels = SETTINGS_SEARCH_GROUPS.appearance.flatMap((group) =>
    group.rows.map((row) => row.label),
  );
  assert.ok(labels.includes("Compact sidebar"));
  assert.ok(labels.includes("Command palette size"));
});

test("words match from their start, so lock does not find block", () => {
  const labels = search("lock").flatMap((hit) =>
    hit.groups.flatMap((group) => group.rows.map((row) => row.label)),
  );
  assert.ok(labels.includes("Lock when the window loses focus"));
  assert.ok(!labels.includes("Block handle on hover"));
});

test("sections named only by their keywords are offered without row hits", () => {
  const hits = search("github");
  assert.deepEqual(
    keywordOnlySections(sections, hits, "github").map((section) => section.id),
    hits.some((hit) => hit.section.id === "about") ? [] : ["about"],
  );
  assert.deepEqual(keywordOnlySections(sections, search("tree guides"), "tree guides"), []);
});
