import assert from "node:assert/strict";
import test from "node:test";
import type { ImportBundle } from "../../src/import/model";
import { planImportBundle } from "../../src/import/plan";

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

test("raw-preserved notes keep exact source and store tags as a property", () => {
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
  const document = plan.contentOperations.find(
    (operation) => operation.type === "save_document",
  );
  assert.ok(document?.type === "save_document");
  const shape = document.documentJson as DocumentShape;
  assert.ok(shape.content.every((node) => node.type !== "paragraph" || !node.content?.some((child) => child.type === "tag_ref")));
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
