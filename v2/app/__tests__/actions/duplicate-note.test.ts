import assert from "node:assert/strict";
import test from "node:test";
import {
  DUPLICATE_TITLE_SUFFIX,
  documentTitleText,
  planNoteDuplicate,
  remapMarkdownIds,
  suffixDocumentTitle,
  suffixMarkdownTitle,
  withFreshBlockIds,
} from "../../src/actions/duplicate-note";
import type { RendererState } from "../../src/store/types";

function sequentialIds(prefix = "new") {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

function heading(text: string) {
  return {
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text }],
  };
}

test("withFreshBlockIds replaces per-note block identities consistently", () => {
  const idMap = new Map<string, string>();
  const source = {
    type: "doc",
    content: [
      { type: "paragraph", attrs: { taskId: "task-1", blockId: "block-1" } },
      { type: "paragraph", attrs: { taskId: "task-1", blockId: null } },
    ],
  };

  const copy = withFreshBlockIds(source, sequentialIds(), idMap) as typeof source;

  assert.equal(copy.content[0]?.attrs.taskId, "new-1");
  assert.equal(copy.content[0]?.attrs.blockId, "new-2");
  assert.equal(copy.content[1]?.attrs.taskId, "new-1");
  assert.equal(copy.content[1]?.attrs.blockId, null);
  assert.deepEqual([...idMap], [
    ["task-1", "new-1"],
    ["block-1", "new-2"],
  ]);
  assert.equal(source.content[0]?.attrs.taskId, "task-1");
});

test("withFreshBlockIds leaves reference and image ids pointing at their targets", () => {
  const source = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "tag_ref", attrs: { id: "tag-1", label: "work" } },
          { type: "image_ref", attrs: { id: "image-1", alt: "" } },
        ],
      },
    ],
  };

  const copy = withFreshBlockIds(source, sequentialIds(), new Map()) as typeof source;

  assert.equal(copy.content[0]?.content?.[0]?.attrs.id, "tag-1");
  assert.equal(copy.content[0]?.content?.[1]?.attrs.id, "image-1");
});

test("suffixDocumentTitle appends to the first block and leaves textless ones alone", () => {
  const document = { type: "doc", content: [heading("Notes"), { type: "paragraph" }] };

  const suffixed = suffixDocumentTitle(document, DUPLICATE_TITLE_SUFFIX) as typeof document;
  assert.equal(documentTitleText(suffixed), "Notes (copy)");
  assert.equal(documentTitleText(document), "Notes");

  const textless = { type: "doc", content: [{ type: "paragraph" }] };
  assert.equal(suffixDocumentTitle(textless, DUPLICATE_TITLE_SUFFIX), textless);
  assert.equal(documentTitleText(textless), "");
});

test("suffixMarkdownTitle only rewrites a heading that ends with the title", () => {
  assert.equal(
    suffixMarkdownTitle("# Notes\n\nbody\n", "Notes", DUPLICATE_TITLE_SUFFIX),
    "# Notes (copy)\n\nbody\n",
  );
  assert.equal(
    suffixMarkdownTitle("```\nNotes\n```\n", "Notes", DUPLICATE_TITLE_SUFFIX),
    "```\nNotes\n```\n",
  );
  assert.equal(suffixMarkdownTitle("", "", DUPLICATE_TITLE_SUFFIX), "");
});

test("remapMarkdownIds rewrites the ids the document copy renamed", () => {
  const idMap = new Map([["task-1", "new-1"]]);
  assert.equal(
    remapMarkdownIds("- [ ] ship <!--skriuw-task:task-1-->\n", idMap),
    "- [ ] ship <!--skriuw-task:new-1-->\n",
  );
});

function stateWith(overrides: Partial<RendererState>): RendererState {
  return {
    sourceNodes: new Map(),
    documents: new Map(),
    propertiesByNoteId: new Map(),
    ...overrides,
  } as RendererState;
}

function sourceNote(id: string, title: string, parentId: string | null = null) {
  return {
    id,
    kind: "note" as const,
    parentId,
    rank: 1,
    title,
    icon: null,
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
    pinnedAt: 10,
  };
}

test("planNoteDuplicate places the copy after the original in the same folder", () => {
  const state = stateWith({
    sourceNodes: new Map([["a", sourceNote("a", "Notes", "folder")]]),
    documents: new Map([
      [
        "a",
        {
          noteId: "a",
          documentJson: { type: "doc", content: [heading("Notes")] },
          markdown: "# Notes\n",
          revision: 3,
          wordCount: 1,
        },
      ],
    ]),
  });

  const plan = planNoteDuplicate(state, "a", 999, sequentialIds());
  assert.ok(plan);
  assert.equal(plan.noteId, "new-1");
  assert.equal(plan.title, "Notes (copy)");

  const [create, ...rest] = plan.operations;
  assert.equal(create?.type, "create_note");
  assert.deepEqual(rest, []);
  assert.deepEqual(create?.type === "create_note" ? create.placement : null, {
    parentId: "folder",
    position: { type: "after", anchorId: "a" },
  });
  assert.equal(create?.type === "create_note" ? create.at : null, 999);
  assert.equal(create?.type === "create_note" ? create.markdown : null, "# Notes (copy)\n");
  assert.equal(
    documentTitleText(create?.type === "create_note" ? create.documentJson : null),
    "Notes (copy)",
  );
});

test("planNoteDuplicate copies properties with fresh ids bound to the copy", () => {
  const state = stateWith({
    sourceNodes: new Map([["a", sourceNote("a", "Notes")]]),
    documents: new Map([
      [
        "a",
        {
          noteId: "a",
          documentJson: { type: "doc", content: [heading("Notes")] },
          markdown: "# Notes\n",
          revision: 1,
          wordCount: 1,
        },
      ],
    ]),
    propertiesByNoteId: new Map([
      [
        "a",
        [
          {
            id: "prop-1",
            noteId: "a",
            name: "Status",
            position: 0,
            options: [{ id: "opt-1", label: "Open", color: "blue" as never }],
            value: { valueVersion: 1 as const, type: "multi-select" as const, value: ["opt-1"] },
          },
        ],
      ],
    ]),
  });

  const plan = planNoteDuplicate(state, "a", 5, sequentialIds());
  assert.ok(plan);
  const property = plan.operations.find((operation) => operation.type === "set_note_property");
  assert.ok(property && property.type === "set_note_property");
  assert.notEqual(property.property.id, "prop-1");
  assert.equal(property.property.noteId, plan.noteId);
  assert.equal(property.property.name, "Status");
  assert.deepEqual(
    property.property.value.type === "multi-select" ? property.property.value.value : null,
    ["opt-1"],
  );
  const original = state.propertiesByNoteId.get("a")?.[0];
  assert.notEqual(property.property.options, original?.options);
  assert.notEqual(property.property.value, original?.value);
});

test("planNoteDuplicate rejects folders, trashed notes, and missing documents", () => {
  const document = {
    noteId: "a",
    documentJson: { type: "doc", content: [heading("Notes")] },
    markdown: "# Notes\n",
    revision: 1,
    wordCount: 1,
  };
  const folder = { ...sourceNote("f", "Folder"), kind: "folder" as const };
  const trashed = { ...sourceNote("t", "Gone"), deletedAt: 7 };

  assert.equal(
    planNoteDuplicate(
      stateWith({ sourceNodes: new Map([["f", folder]]), documents: new Map([["f", document]]) }),
      "f",
      1,
      sequentialIds(),
    ),
    null,
  );
  assert.equal(
    planNoteDuplicate(
      stateWith({ sourceNodes: new Map([["t", trashed]]), documents: new Map([["t", document]]) }),
      "t",
      1,
      sequentialIds(),
    ),
    null,
  );
  assert.equal(
    planNoteDuplicate(
      stateWith({ sourceNodes: new Map([["a", sourceNote("a", "Notes")]]) }),
      "a",
      1,
      sequentialIds(),
    ),
    null,
  );
  assert.equal(planNoteDuplicate(stateWith({}), "missing", 1, sequentialIds()), null);
});

test("planNoteDuplicate falls back to the node title when the first block has no text", () => {
  const state = stateWith({
    sourceNodes: new Map([["a", sourceNote("a", "Untitled")]]),
    documents: new Map([
      [
        "a",
        {
          noteId: "a",
          documentJson: { type: "doc", content: [{ type: "paragraph" }] },
          markdown: "\n",
          revision: 1,
          wordCount: 0,
        },
      ],
    ]),
  });

  assert.equal(planNoteDuplicate(state, "a", 1, sequentialIds())?.title, "Untitled (copy)");
});

test("planNoteDuplicate bounds the copy's title the way the editor derives it", async () => {
  const { TITLE_MAX_LENGTH, boundTitle } = await import("../../src/editor/note-title");
  const long = "x".repeat(TITLE_MAX_LENGTH);
  const state = stateWith({
    sourceNodes: new Map([["a", sourceNote("a", long)]]),
    documents: new Map([
      [
        "a",
        {
          noteId: "a",
          documentJson: { type: "doc", content: [heading(long)] },
          markdown: `# ${long}\n`,
          revision: 1,
          wordCount: 1,
        },
      ],
    ]),
  });

  const plan = planNoteDuplicate(state, "a", 1, sequentialIds());
  assert.ok(plan);
  assert.equal(plan.title.length, TITLE_MAX_LENGTH);
  const create = plan.operations[0];
  assert.equal(
    boundTitle(documentTitleText(create?.type === "create_note" ? create.documentJson : null)),
    plan.title,
  );
});
