import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../../src/shared/lib/noop";
import {
  getCommandPaletteGroups,
  parseCommandQuery,
  type CommandPaletteItem,
} from "../../../src/shared/ui/command-palette-model";

test("filters commands by label, description, shortcut, keywords, hint, and group", () => {
  const items: CommandPaletteItem[] = [
    {
      id: "new-note",
      label: "Create note",
      shortcut: "mod+n",
      description: "Create a fresh note.",
      keywords: ["file"],
      group: "Actions",
      action: noop,
    },
    {
      id: "handbook",
      label: "Skriuw handbook",
      hint: "Guides",
      group: "Notes",
      action: noop,
    },
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      group: "Navigation",
      action: noop,
    },
  ];

  assert.deepEqual(getCommandPaletteGroups(items, "guide"), [
    { group: "Notes", items: [items[1]] },
  ]);
  assert.deepEqual(getCommandPaletteGroups(items, "mod+n"), [
    { group: "Actions", items: [items[0]] },
  ]);
  assert.deepEqual(getCommandPaletteGroups(items, "sidebar"), [
    { group: "Navigation", items: [items[2]] },
  ]);
});

test("bang prefixes scope results to their groups and strip the bang from the query", () => {
  const items: CommandPaletteItem[] = [
    { id: "note", label: "Dark notes", group: "Notes", alwaysShow: true, action: noop },
    {
      id: "recent-note",
      label: "Recent note",
      group: "Notes",
      keywords: ["dark"],
      searchOnly: true,
      action: noop,
    },
    { id: "sidebar", label: "Toggle sidebar", group: "Navigation", action: noop },
  ];

  assert.deepEqual(
    getCommandPaletteGroups(items, "!n dark").map((group) => group.group),
    ["Notes"],
  );
  assert.deepEqual(
    getCommandPaletteGroups(items, "!n").map((group) => group.group),
    ["Notes"],
  );
  assert.deepEqual(
    getCommandPaletteGroups(items, "!a").map((group) => group.group),
    ["Navigation"],
  );
});

test("searchOnly items stay hidden until searched or scoped by a bang", () => {
  const items: CommandPaletteItem[] = [
    { id: "action", label: "Create note", group: "Actions", action: noop },
    {
      id: "hidden-note",
      label: "Hidden note",
      group: "Notes",
      keywords: ["dark"],
      searchOnly: true,
      action: noop,
    },
  ];

  assert.deepEqual(
    getCommandPaletteGroups(items, "").map((group) => group.group),
    ["Actions"],
  );
  assert.deepEqual(
    getCommandPaletteGroups(items, "dark").map((group) => group.group),
    ["Notes"],
  );
  assert.deepEqual(
    getCommandPaletteGroups(items, "!n").map((group) => group.group),
    ["Notes"],
  );
});

test("parseCommandQuery treats unknown or lone bangs as plain text", () => {
  assert.partialDeepStrictEqual(parseCommandQuery("!n dark"), { bang: "n", query: "dark" });
  assert.partialDeepStrictEqual(parseCommandQuery("!z foo"), { bang: null, query: "!z foo" });
  assert.partialDeepStrictEqual(parseCommandQuery("!"), { bang: null, query: "!" });
  assert.partialDeepStrictEqual(parseCommandQuery("  hello "), { bang: null, query: "hello" });
});

test("parseCommandQuery resolves multi-letter bang spellings to their canonical key", () => {
  assert.partialDeepStrictEqual(parseCommandQuery("!act deploy"), { bang: "a", query: "deploy" });
  assert.partialDeepStrictEqual(parseCommandQuery("!action"), { bang: "a", query: "" });
  assert.partialDeepStrictEqual(parseCommandQuery("!people ann"), { bang: "p", query: "ann" });
  assert.partialDeepStrictEqual(parseCommandQuery("!per"), { bang: "p", query: "" });
  assert.partialDeepStrictEqual(parseCommandQuery("!tags"), { bang: "t", query: "" });
  assert.partialDeepStrictEqual(parseCommandQuery("!go"), { bang: "g", query: "" });
  assert.partialDeepStrictEqual(parseCommandQuery("!nav"), { bang: "g", query: "" });
});

test("bangs scope to their own category groups", () => {
  const items: CommandPaletteItem[] = [
    { id: "tag", label: "urgent", group: "Tags", searchOnly: true, action: noop },
    { id: "person", label: "Ann", group: "People", searchOnly: true, action: noop },
    { id: "nav", label: "Go to trash", group: "Navigation", action: noop },
  ];

  assert.deepEqual(
    getCommandPaletteGroups(items, "!t").map((group) => group.group),
    ["Tags"],
  );
  assert.deepEqual(
    getCommandPaletteGroups(items, "!p").map((group) => group.group),
    ["People"],
  );
  assert.deepEqual(
    getCommandPaletteGroups(items, "!g").map((group) => group.group),
    ["Navigation"],
  );
});

test("uses prototype group order before custom groups", () => {
  const items: CommandPaletteItem[] = [
    { id: "recent", label: "Recent file", group: "Recent", action: noop },
    { id: "custom", label: "Custom command", group: "Workspace", action: noop },
    { id: "note", label: "Note file", group: "Notes", action: noop },
    { id: "action", label: "Action", action: noop },
  ];

  assert.deepEqual(
    getCommandPaletteGroups(items, "").map((group) => group.group),
    ["Recent", "Actions", "Notes", "Workspace"],
  );
});

test("fuzzy matches subsequences and ranks label hits above keyword hits", () => {
  const items: CommandPaletteItem[] = [
    {
      id: "keyword-hit",
      label: "Create file",
      keywords: ["note"],
      group: "Actions",
      action: noop,
    },
    { id: "label-hit", label: "Note file", group: "Actions", action: noop },
    { id: "subsequence-hit", label: "Open Settings Theme", group: "Actions", action: noop },
  ];

  const subsequenceIds = getCommandPaletteGroups(items, "ost")
    .flatMap((group) => group.items)
    .map((item) => item.id);
  assert.ok(subsequenceIds.includes("subsequence-hit"));

  const rankedIds = getCommandPaletteGroups(items, "note")
    .flatMap((group) => group.items)
    .map((item) => item.id);
  assert.ok(rankedIds.indexOf("label-hit") < rankedIds.indexOf("keyword-hit"));
});

test("orders Recent by descending frecency and caps it at five items", () => {
  const items: CommandPaletteItem[] = Array.from({ length: 7 }, (_, index) => ({
    id: `command-${index}`,
    label: `Command ${index}`,
    group: "Actions",
    action: noop,
  }));
  const frecency = Object.fromEntries(items.map((item, index) => [item.id, index + 1]));

  const groups = getCommandPaletteGroups(items, "", frecency);
  assert.equal(groups[0]?.group, "Recent");
  assert.deepEqual(
    groups[0]?.items.map((item) => item.id),
    ["command-6", "command-5", "command-4", "command-3", "command-2"],
  );
});

test("surfaces frecent commands in the Recent group when idle", () => {
  const items: CommandPaletteItem[] = [
    { id: "used-often", label: "Used often", group: "Actions", action: noop },
    { id: "never-used", label: "Never used", group: "Actions", action: noop },
  ];

  const groups = getCommandPaletteGroups(items, "", { "used-often": 3 });
  assert.deepEqual(groups[0], { group: "Recent", items: [items[0]] });

  const searching = getCommandPaletteGroups(items, "used", { "used-often": 3 });
  assert.ok(!searching.map((group) => group.group).includes("Recent"));
});

test("content hits stay hidden while idle and rank after title matches when searching", () => {
  const items: CommandPaletteItem[] = [
    { id: "note:title", label: "Milk run", group: "Notes", action: noop },
    {
      id: "note:body",
      label: "Groceries",
      hint: "…buy milk and eggs…",
      group: "Content",
      searchOnly: true,
      alwaysShow: true,
      action: noop,
    },
  ];

  const idle = getCommandPaletteGroups(items, "");
  assert.deepEqual(
    idle.map((group) => group.group),
    ["Notes"],
  );

  const searching = getCommandPaletteGroups(items, "milk");
  assert.deepEqual(
    searching.map((group) => group.group),
    ["Notes", "Content"],
  );
  assert.deepEqual(searching[1]?.items.map((item) => item.id), ["note:body"]);
});
