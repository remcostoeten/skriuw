import assert from "node:assert/strict";
import { test } from "vitest";
import type { ImportBundle } from "@/features/transfer/import/model";
import { planImportBundle } from "@/features/transfer/import/plan";

function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
}

function bundle(notes: ImportBundle["notes"]): ImportBundle {
  return {
    sourceId: "markdown",
    sourceLabel: "Markdown",
    directories: [],
    notes,
    warnings: [],
  };
}

test("planImportBundle emits set_note_property operations for adapter properties", () => {
  const plan = planImportBundle(
    {
      sourceId: "obsidian",
      sourceLabel: "Obsidian",
      directories: [],
      notes: [
        {
          relativePath: "Note.md",
          title: "Note",
          markdown: "body",
          properties: [
            { name: "status", value: { type: "text", value: "draft" } },
            { name: "topics", value: { type: "list", values: ["work", "deep"] } },
          ],
        },
      ],
      warnings: [],
    },
    123,
    sequentialIds(),
  );
  const noteOperation = plan.operations.find((operation) => operation.type === "create_note");
  assert.ok(noteOperation);
  const propertyOperations = plan.operations.filter(
    (operation) => operation.type === "set_note_property",
  );
  assert.equal(propertyOperations.length, 2);
  const [first, second] = propertyOperations;
  assert.ok(first.type === "set_note_property" && second.type === "set_note_property");
  assert.equal(first.property.noteId, noteOperation.id);
  assert.equal(first.property.name, "status");
  assert.equal(first.property.position, 0);
  assert.deepEqual(first.property.value, { valueVersion: 1, type: "text", value: "draft" });
  assert.deepEqual(first.property.options, []);
  assert.equal(second.property.name, "topics");
  assert.equal(second.property.position, 1);
  assert.equal(second.property.value.type, "multi-select");
  assert.deepEqual(
    second.property.options.map((option) => option.label),
    ["work", "deep"],
  );
  assert.ok(
    second.property.value.type === "multi-select" &&
      second.property.value.value.every((id) =>
        second.property.options.some((option) => option.id === id),
      ),
  );
  assert.equal(first.at, 123);
});

test("skip mode drops directories whose notes were all skipped", () => {
  const source: ImportBundle = {
    sourceId: "markdown",
    sourceLabel: "Markdown",
    directories: ["Folder", "Empty"],
    notes: [{ relativePath: "Folder/A.md", title: "A", markdown: "body" }],
    warnings: [],
  };
  const plan = planImportBundle(source, 200, sequentialIds(), [], [], {
    duplicateMode: "skip",
    sourceKey: "source-key",
    receipts: [
      {
        provider: "markdown",
        sourceKey: "source-key",
        sourcePath: "Folder/A.md",
        noteId: "existing-note",
        importedAt: 100,
      },
    ],
  });
  const folders = plan.operations.filter((operation) => operation.type === "create_folder");
  assert.equal(plan.skippedDuplicates, 1);
  assert.deepEqual(
    folders.map((operation) => operation.type === "create_folder" && operation.title),
    ["Empty"],
  );
});

test("durable receipts drive skip and update re-import modes", () => {
  const source = bundle([
    {
      relativePath: "Folder/A.md",
      title: "Updated A",
      markdown: "updated",
      properties: [{ name: "Status", value: { type: "text", value: "done" } }],
    },
  ]);
  const receipt = {
    provider: "markdown",
    sourceKey: "source-key",
    sourcePath: "Folder/A.md",
    noteId: "existing-note",
    importedAt: 100,
  };
  const skipped = planImportBundle(source, 200, sequentialIds(), [], [], {
    duplicateMode: "skip",
    sourceKey: "source-key",
    receipts: [receipt],
  });
  assert.equal(skipped.noteCount, 0);
  assert.equal(skipped.skippedDuplicates, 1);
  assert.equal(skipped.contentOperations.length, 0);

  const updated = planImportBundle(source, 200, sequentialIds(), [], [], {
    duplicateMode: "update",
    sourceKey: "source-key",
    receipts: [receipt],
    existingDocuments: new Map([
      ["existing-note", { id: "existing-note", title: "A", revision: 7 }],
    ]),
    existingPropertiesByNoteId: new Map([
      [
        "existing-note",
        [
          {
            id: "old-status",
            noteId: "existing-note",
            name: "Status",
            position: 0,
            value: { valueVersion: 1, type: "text", value: "old" },
            options: [],
          },
        ],
      ],
    ]),
  });
  assert.equal(updated.createdNotes, 0);
  assert.equal(updated.updatedNotes, 1);
  assert.ok(
    updated.operations.some(
      (operation) =>
        operation.type === "rename_node" &&
        operation.id === "existing-note" &&
        operation.title === "Updated A",
    ),
  );
  assert.ok(
    updated.operations.some(
      (operation) =>
        operation.type === "remove_note_property" && operation.propertyId === "old-status",
    ),
  );
  const save = updated.contentOperations[0];
  assert.ok(save?.type === "save_document");
  assert.equal(save.noteId, "existing-note");
  assert.equal(save.expectedRevision, 7);
  assert.ok(
    updated.operations.some(
      (operation) =>
        operation.type === "record_provider_import" && operation.receipt.noteId === "existing-note",
    ),
  );
});

test("receipts for deleted notes stop skipping the source", () => {
  const source = bundle([{ relativePath: "Folder/A.md", title: "A", markdown: "body" }]);
  const receipt = {
    provider: "markdown",
    sourceKey: "source-key",
    sourcePath: "Folder/A.md",
    noteId: "deleted-note",
    importedAt: 100,
  };
  const stale = planImportBundle(source, 200, sequentialIds(), [], [], {
    duplicateMode: "skip",
    sourceKey: "source-key",
    receipts: [receipt],
    presentNoteIds: new Set<string>(),
  });
  assert.equal(stale.skippedDuplicates, 0);
  assert.equal(stale.createdNotes, 1);

  const live = planImportBundle(source, 200, sequentialIds(), [], [], {
    duplicateMode: "skip",
    sourceKey: "source-key",
    receipts: [receipt],
    presentNoteIds: new Set(["deleted-note"]),
  });
  assert.equal(live.skippedDuplicates, 1);
  assert.equal(live.createdNotes, 0);
});

test("destination folder owns imported root nodes", () => {
  const plan = planImportBundle(
    bundle([
      { relativePath: "Nested/A.md", title: "A", markdown: "body" },
      { relativePath: "Root.md", title: "Root", markdown: "body" },
    ]),
    123,
    sequentialIds(),
    [],
    [],
    { destinationParentId: "destination" },
  );
  const roots = plan.operations.filter(
    (operation) =>
      (operation.type === "create_folder" || operation.type === "create_note") &&
      operation.placement.parentId === "destination",
  );
  assert.equal(roots.length, 2);
});
