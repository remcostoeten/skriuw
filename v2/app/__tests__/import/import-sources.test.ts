import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { detectImportSource, importSourceKey } from "../../src/import/model";
import { applyImportGrouping, planImportBundle } from "../../src/import/plan";
import { importSources } from "../../src/import/sources";
import { bearSource } from "../../src/import/sources/bear";
import { appleNotesSource } from "../../src/import/sources/apple-notes";
import { markdownSource } from "../../src/import/sources/markdown";
import { plainTextSource } from "../../src/import/sources/plain-text";
import { simplenoteSource } from "../../src/import/sources/simplenote";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], skipped: 0, ...partial };
}

function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
}

test("markdown directory detects as markdown source", () => {
  const source = detectImportSource(
    importSources,
    tree({ files: [{ relativePath: "Note.md", content: "# Note" }] }),
  );
  assert.equal(source?.id, "markdown");
});

test("Apple Notes Markdown is available as a manual source without outranking Markdown", () => {
  const input = tree({ files: [{ relativePath: "Note.md", content: "# Note" }] });
  assert.equal(appleNotesSource.detect(input), 0.09);
  assert.equal(appleNotesSource.parse(input).notes[0].title, "Note");
  assert.equal(detectImportSource(importSources, input)?.id, "markdown");
});

test("simplenote export outranks the markdown fallback", () => {
  const source = detectImportSource(
    importSources,
    tree({
      files: [
        { relativePath: "Note.md", content: "# Note" },
        {
          relativePath: "notes.json",
          content: JSON.stringify({ activeNotes: [{ content: "Hello" }] }),
        },
      ],
    }),
  );
  assert.equal(source?.id, "simplenote");
});

test("textbundle files detect as bear and hoist notes out of bundles", () => {
  const input = tree({
    directories: ["Groceries.textbundle", "Groceries.textbundle/assets"],
    files: [
      {
        relativePath: "Groceries.textbundle/text.md",
        content: "# Groceries\n![photo](assets/list.png)",
      },
    ],
  });
  const source = detectImportSource(importSources, input);
  assert.equal(source?.id, "bear");
  const bundle = bearSource.parse(input);
  assert.equal(bundle.notes.length, 1);
  assert.equal(bundle.notes[0].relativePath, "Groceries.md");
  assert.equal(bundle.notes[0].title, "Groceries");
  assert.ok(bundle.notes[0].markdown.includes("](Groceries.textbundle/assets/list.png)"));
  assert.deepEqual(bundle.directories, []);
});

test("Bear TextBundle metadata supplies timestamps, tags, and protected-note diagnostics", () => {
  const input = tree({
    directories: [
      "One.textbundle",
      "Secret.textbundle",
      "Trash.textbundle",
    ],
    files: [
      {
        relativePath: "One.textbundle/text.md",
        content: "# One\nBody #project/alpha and #multi word#",
      },
      {
        relativePath: "One.textbundle/info.json",
        content: JSON.stringify({
          "net.shinyfrog.bear": {
            creationDate: "2026-01-02T03:04:05Z",
            modificationDate: "2026-02-03T04:05:06Z",
          },
        }),
      },
      {
        relativePath: "Secret.textbundle/text.md",
        content: "ciphertext",
      },
      {
        relativePath: "Secret.textbundle/info.json",
        content: JSON.stringify({
          "net.shinyfrog.bear": { encrypted: 1 },
        }),
      },
      {
        relativePath: "Trash.textbundle/text.md",
        content: "old",
      },
      {
        relativePath: "Trash.textbundle/info.json",
        content: JSON.stringify({
          "net.shinyfrog.bear": { trashed: true },
        }),
      },
    ],
  });
  const bundle = bearSource.parse(input);
  assert.equal(bundle.notes.length, 1);
  assert.deepEqual(bundle.notes[0].tags, ["multi word", "project/alpha"]);
  assert.equal(
    bundle.notes[0].createdAt,
    Date.parse("2026-01-02T03:04:05Z"),
  );
  assert.equal(
    bundle.notes[0].modifiedAt,
    Date.parse("2026-02-03T04:05:06Z"),
  );
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("trashed")));
  assert.ok(
    bundle.warnings.some(
      (warning) =>
        warning.severity === "error" && warning.message.includes("encrypted"),
    ),
  );
});

test("plain text only directory detects as plain text", () => {
  const input = tree({
    files: [{ relativePath: "todo.txt", content: "milk\neggs" }],
  });
  const source = detectImportSource(importSources, input);
  assert.equal(source?.id, "plain-text");
  const bundle = plainTextSource.parse(input);
  assert.equal(bundle.notes[0].title, "todo");
});

test("empty tree detects nothing", () => {
  assert.equal(detectImportSource(importSources, tree({})), null);
});

test("durable source key follows selected location, not changing export content", async () => {
  const first = await importSourceKey("/exports/vault/");
  const same = await importSourceKey("/exports/vault");
  const moved = await importSourceKey("/exports/moved-vault");
  assert.equal(first, same);
  assert.notEqual(first, moved);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("simplenote parse maps content, titles, timestamps, and skips trashed", () => {
  const bundle = simplenoteSource.parse(
    tree({
      files: [
        {
          relativePath: "notes.json",
          content: JSON.stringify({
            activeNotes: [
              {
                content: "# Shopping\nmilk",
                creationDate: "2024-01-02T03:04:05.000Z",
                lastModified: "2024-02-02T03:04:05.000Z",
                tags: ["errands"],
                pinned: true,
              },
              { content: "Shopping\nagain" },
            ],
            trashedNotes: [{ content: "old" }],
          }),
        },
      ],
    }),
  );
  assert.equal(bundle.notes.length, 2);
  assert.equal(bundle.notes[0].title, "Shopping");
  assert.equal(bundle.notes[0].relativePath, "Shopping.md");
  assert.equal(bundle.notes[1].relativePath, "Shopping (2).md");
  assert.equal(bundle.notes[0].createdAt, Date.parse("2024-01-02T03:04:05.000Z"));
  assert.deepEqual(bundle.notes[0].tags, ["errands"]);
  assert.equal(bundle.notes[0].pinned, true);
  assert.equal(bundle.notes[1].pinned, undefined);
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("1 trashed")));
});

test("markdown adapter ignores textbundle internals and json files", () => {
  const bundle = markdownSource.parse(
    tree({
      directories: ["Docs", "X.textbundle"],
      files: [
        { relativePath: "Docs/Note.md", content: "# Note" },
        { relativePath: "X.textbundle/text.md", content: "# Bundled" },
        { relativePath: "notes.json", content: "{}" },
      ],
    }),
  );
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath),
    ["Docs/Note.md"],
  );
  assert.deepEqual(bundle.directories, ["Docs"]);
});

test("planImportBundle builds folders from note paths and keeps adapter titles", () => {
  const plan = planImportBundle(
    {
      sourceId: "markdown",
      sourceLabel: "Markdown",
      directories: ["Empty"],
      notes: [
        { relativePath: "Docs/Guide.md", title: "Guide", markdown: "# Guide\nBody" },
        { relativePath: "Root.md", title: "Custom Title", markdown: "text" },
      ],
      warnings: [],
    },
    123,
    sequentialIds(),
  );
  assert.equal(plan.noteCount, 2);
  assert.equal(plan.folderCount, 2);
  const folders = plan.operations.filter((operation) => operation.type === "create_folder");
  assert.deepEqual(
    folders.map((operation) => operation.type === "create_folder" && operation.title),
    ["Docs", "Empty"],
  );
  const noteOperations = plan.operations.filter(
    (operation) => operation.type === "create_note",
  );
  assert.equal(noteOperations.length, 2);
  const guide = noteOperations.find(
    (operation) => operation.type === "create_note" && operation.title === "Guide",
  );
  assert.ok(guide);
  const custom = noteOperations.find(
    (operation) => operation.type === "create_note" && operation.title === "Custom Title",
  );
  assert.ok(custom);
});

test("planImportBundle applies valid provider timestamps", () => {
  const createdAt = Date.parse("2024-01-02T03:04:05.000Z");
  const modifiedAt = Date.parse("2024-02-02T03:04:05.000Z");
  const plan = planImportBundle(
    {
      sourceId: "simplenote",
      sourceLabel: "Simplenote",
      directories: [],
      notes: [
        {
          relativePath: "Note.md",
          title: "Note",
          markdown: "Body",
          createdAt,
          modifiedAt,
        },
      ],
      warnings: [],
    },
    999,
    sequentialIds(),
  );
  const create = plan.operations.find(
    (operation) => operation.type === "create_note",
  );
  const save = plan.contentOperations.find(
    (operation) => operation.type === "save_document",
  );
  assert.equal(create?.at, createdAt);
  assert.equal(save?.at, modifiedAt);
});

test("planImportBundle pins created notes the adapter marked as pinned", () => {
  const createdAt = Date.parse("2024-01-02T03:04:05.000Z");
  const plan = planImportBundle(
    {
      sourceId: "simplenote",
      sourceLabel: "Simplenote",
      directories: [],
      notes: [
        { relativePath: "Pinned.md", title: "Pinned", markdown: "Body", createdAt, pinned: true },
        { relativePath: "Plain.md", title: "Plain", markdown: "Body" },
      ],
      warnings: [],
    },
    999,
    sequentialIds(),
  );
  const create = plan.operations.find(
    (operation) => operation.type === "create_note" && operation.title === "Pinned",
  );
  assert.ok(create);
  const pins = plan.operations.filter(
    (operation) => operation.type === "set_node_pinned",
  );
  assert.equal(pins.length, 1);
  assert.deepEqual(pins[0], {
    type: "set_node_pinned",
    id: create.id,
    pinned: true,
    at: createdAt,
  });
  assert.equal(plan.pinnedNotes, 1);
  assert.ok(
    plan.operations.indexOf(pins[0]) > plan.operations.indexOf(create),
  );
});

test("applyImportGrouping nests roots in a source folder with per-year note folders", () => {
  const y2023 = Date.parse("2023-06-01T00:00:00.000Z");
  const y2024 = Date.parse("2024-06-01T00:00:00.000Z");
  const operations = planImportBundle(
    {
      sourceId: "simplenote",
      sourceLabel: "Simplenote",
      directories: [],
      notes: [
        { relativePath: "Later.md", title: "Later", markdown: "Body", createdAt: y2024 },
        { relativePath: "Earlier.md", title: "Earlier", markdown: "Body", createdAt: y2023 },
      ],
      warnings: [],
    },
    999,
    sequentialIds(),
  ).operations;
  const grouping = applyImportGrouping(
    operations,
    { destinationFolderId: "dest", sourceFolderLabel: "Simplenote", groupByYear: true },
    999,
    sequentialIds(),
  );
  assert.deepEqual(
    grouping.map((operation) =>
      operation.type === "create_folder"
        ? { title: operation.title, parentId: operation.placement.parentId }
        : operation.type,
    ),
    [
      { title: "Simplenote", parentId: "dest" },
      { title: "2023", parentId: "id-1" },
      { title: "2024", parentId: "id-1" },
    ],
  );
  const parentByTitle = new Map(
    operations.flatMap((operation) =>
      operation.type === "create_note"
        ? [[operation.title, operation.placement.parentId]]
        : [],
    ),
  );
  assert.equal(parentByTitle.get("Earlier"), "id-2");
  assert.equal(parentByTitle.get("Later"), "id-3");
});

test("applyImportGrouping without options matches plain destination reparenting", () => {
  const operations = planImportBundle(
    {
      sourceId: "markdown",
      sourceLabel: "Markdown",
      directories: [],
      notes: [
        { relativePath: "Docs/Guide.md", title: "Guide", markdown: "Body" },
        { relativePath: "Root.md", title: "Root", markdown: "Body" },
      ],
      warnings: [],
    },
    999,
    sequentialIds(),
  ).operations;
  const nestedBefore = operations.find(
    (operation) => operation.type === "create_note" && operation.title === "Guide",
  );
  assert.ok(nestedBefore && nestedBefore.type === "create_note");
  const nestedParent = nestedBefore.placement.parentId;
  const grouping = applyImportGrouping(
    operations,
    { destinationFolderId: "dest", sourceFolderLabel: null, groupByYear: false },
    999,
    sequentialIds(),
  );
  assert.deepEqual(grouping, []);
  for (const operation of operations) {
    if (operation.type !== "create_folder" && operation.type !== "create_note") {
      continue;
    }
    const expected =
      operation.type === "create_note" && operation.title === "Guide"
        ? nestedParent
        : "dest";
    assert.equal(operation.placement.parentId, expected);
  }
});

test("planImportBundle keeps provenance properties out of the main operations", () => {
  const at = Date.parse("2024-03-04T05:06:07.000Z");
  const plan = planImportBundle(
    {
      sourceId: "apple-notes",
      sourceLabel: "Apple Notes Markdown",
      directories: [],
      notes: [{ relativePath: "Note.md", title: "Note", markdown: "Body" }],
      warnings: [],
    },
    at,
    sequentialIds(),
  );
  assert.equal(plan.sourcePropertyNotes, 1);
  assert.equal(
    plan.operations.filter((operation) => operation.type === "set_note_property")
      .length,
    0,
  );
  const properties = plan.sourcePropertyOperations.flatMap((operation) =>
    operation.type === "set_note_property" ? [operation.property] : [],
  );
  assert.deepEqual(
    properties.map((property) => property.name),
    ["Source", "Imported"],
  );
  assert.deepEqual(properties[0]?.value, {
    valueVersion: 1,
    type: "text",
    value: "Apple Notes Markdown",
  });
  const noteId = plan.notes[0]?.id;
  assert.ok(noteId);
  assert.ok(properties.every((property) => property.noteId === noteId));
});

test("planImportBundle keeps property positions dense so the store accepts them", () => {
  const plan = planImportBundle(
    {
      sourceId: "notion",
      sourceLabel: "Notion",
      directories: [],
      notes: [
        {
          relativePath: "Note.md",
          title: "Note",
          markdown: "Body",
          properties: [
            { name: "Status", value: { type: "text", value: "Open" } },
            { name: "Owner", value: { type: "text", value: "Remco" } },
          ],
        },
        {
          relativePath: "Tagged.md",
          title: "Tagged",
          markdown: "Body",
          tags: ["home"],
        },
      ],
      warnings: [],
    },
    123,
    sequentialIds(),
  );
  const positionsByNote = new Map<string, number[]>();
  for (const operation of [
    ...plan.operations,
    ...plan.sourcePropertyOperations,
  ]) {
    if (operation.type !== "set_note_property") {
      continue;
    }
    const positions = positionsByNote.get(operation.property.noteId) ?? [];
    positions.push(operation.property.position);
    positionsByNote.set(operation.property.noteId, positions);
  }
  for (const positions of positionsByNote.values()) {
    assert.deepEqual(
      [...positions].sort((left, right) => left - right),
      positions.map((_, index) => index),
    );
  }
});

test("planImportBundle never overwrites an imported property with provenance", () => {
  const plan = planImportBundle(
    {
      sourceId: "obsidian",
      sourceLabel: "Obsidian",
      directories: [],
      notes: [
        {
          relativePath: "Note.md",
          title: "Note",
          markdown: "Body",
          properties: [{ name: "source", value: { type: "text", value: "mine" } }],
        },
      ],
      warnings: [],
    },
    123,
    sequentialIds(),
  );
  const names = plan.sourcePropertyOperations.flatMap((operation) =>
    operation.type === "set_note_property" ? [operation.property.name] : [],
  );
  assert.deepEqual(names, ["Imported"]);
});
