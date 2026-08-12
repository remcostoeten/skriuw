import assert from "node:assert/strict";
import test from "node:test";
import type { ImportBundle } from "../../../../src/features/transfer/import/model";
import { planImportBundle } from "../../../../src/features/transfer/import/plan";

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

type DocumentShape = { content: { type: string; content?: { type: string; attrs?: { id: string; label: string } }[] }[] };

test("adapter tags create workspace tags and append a chip paragraph", () => {
  const plan = planImportBundle(
    bundle([
      { relativePath: "A.md", title: "A", markdown: "body", tags: ["work", "deep"] },
      { relativePath: "B.md", title: "B", markdown: "body", tags: ["Work"] },
    ]),
    123,
    sequentialIds(),
  );
  const tagOperations = plan.operations.filter((operation) => operation.type === "create_tag");
  assert.equal(tagOperations.length, 2);
  assert.equal(plan.createdTags, 2);
  assert.deepEqual(
    tagOperations.map((operation) => operation.type === "create_tag" && operation.tag.name),
    ["work", "deep"],
  );
  const documents = plan.contentOperations.filter(
    (operation) => operation.type === "save_document",
  );
  assert.equal(documents.length, 2);
  const first = documents[0];
  assert.ok(first.type === "save_document");
  const document = first.documentJson as DocumentShape;
  const chipParagraph = document.content[document.content.length - 1];
  assert.equal(chipParagraph?.type, "paragraph");
  const chips = chipParagraph?.content?.filter((node) => node.type === "tag_ref") ?? [];
  assert.deepEqual(
    chips.map((chip) => chip.attrs?.label),
    ["work", "deep"],
  );
  assert.ok(first.markdown.endsWith("\n\n#work #deep"));
  const second = documents[1];
  assert.ok(second.type === "save_document");
  const secondDocument = second.documentJson as DocumentShape;
  const secondChips =
    secondDocument.content[secondDocument.content.length - 1]?.content?.filter(
      (node) => node.type === "tag_ref",
    ) ?? [];
  assert.equal(secondChips.length, 1);
  const workTag = tagOperations.find(
    (operation) => operation.type === "create_tag" && operation.tag.name === "work",
  );
  assert.ok(workTag?.type === "create_tag");
  assert.equal(secondChips[0]?.attrs?.id, workTag.tag.id);
});

test("existing workspace tags are reused case-insensitively", () => {
  const plan = planImportBundle(
    bundle([{ relativePath: "A.md", title: "A", markdown: "body", tags: ["Work"] }]),
    123,
    sequentialIds(),
    [],
    [{ id: "tag-existing", name: "work" }],
  );
  assert.equal(plan.createdTags, 0);
  assert.equal(
    plan.operations.filter((operation) => operation.type === "create_tag").length,
    0,
  );
  const document = plan.contentOperations.find(
    (operation) => operation.type === "save_document",
  );
  assert.ok(document?.type === "save_document");
  const shape = document.documentJson as DocumentShape;
  const chips =
    shape.content[shape.content.length - 1]?.content?.filter(
      (node) => node.type === "tag_ref",
    ) ?? [];
  assert.equal(chips[0]?.attrs?.id, "tag-existing");
});

test("raw-preserved notes keep exact source, property, and workspace backlinks", () => {
  const plan = planImportBundle(
    bundle([
      {
        relativePath: "A.md",
        title: "A",
        markdown: "---\nkey: value\n---\nbody",
        tags: ["work"],
      },
    ]),
    123,
    sequentialIds(),
  );
  assert.equal(plan.tagSkippedNotes, 0);
  assert.equal(plan.tagPropertyNotes, 1);
  assert.equal(plan.createdTags, 1);
  const document = plan.contentOperations.find(
    (operation) => operation.type === "save_document",
  );
  assert.ok(document?.type === "save_document");
  assert.equal(document.markdown, "---\nkey: value\n---\nbody");
  const shape = document.documentJson as DocumentShape;
  const references = shape.content.flatMap((node) =>
    node.content?.filter((child) => child.type === "tag_ref") ?? [],
  );
  assert.equal(references.length, 1);
  const tag = plan.operations.find((operation) => operation.type === "create_tag");
  assert.ok(tag?.type === "create_tag");
  assert.equal(references[0]?.attrs?.id, tag.tag.id);
  const property = plan.operations.find(
    (operation) => operation.type === "set_note_property",
  );
  assert.ok(property?.type === "set_note_property");
  assert.equal(property.property.name, "Tags");
  assert.equal(property.property.value.type, "multi-select");
});

test("notes without tags add no tag operations", () => {
  const plan = planImportBundle(
    bundle([{ relativePath: "A.md", title: "A", markdown: "body" }]),
    123,
    sequentialIds(),
  );
  assert.equal(plan.createdTags, 0);
  assert.equal(plan.tagSkippedNotes, 0);
});

test("invalid and oversized tags are skipped and counted", () => {
  const plan = planImportBundle(
    bundle([
      {
        relativePath: "A.md",
        title: "A",
        markdown: "body",
        tags: ["", "x".repeat(81), "valid"],
      },
    ]),
    123,
    sequentialIds(),
  );
  assert.equal(plan.createdTags, 1);
  assert.equal(plan.skippedTags, 2);
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
  const folders = plan.operations.filter(
    (operation) => operation.type === "create_folder",
  );
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
      [
        "existing-note",
        { id: "existing-note", title: "A", revision: 7 },
      ],
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
        operation.type === "remove_note_property" &&
        operation.propertyId === "old-status",
    ),
  );
  const save = updated.contentOperations[0];
  assert.ok(save?.type === "save_document");
  assert.equal(save.noteId, "existing-note");
  assert.equal(save.expectedRevision, 7);
  assert.ok(
    updated.operations.some(
      (operation) =>
        operation.type === "record_provider_import" &&
        operation.receipt.noteId === "existing-note",
    ),
  );
});

test("receipts for deleted notes stop skipping the source", () => {
  const source = bundle([
    { relativePath: "Folder/A.md", title: "A", markdown: "body" },
  ]);
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
      (operation.type === "create_folder" ||
        operation.type === "create_note") &&
      operation.placement.parentId === "destination",
  );
  assert.equal(roots.length, 2);
});
