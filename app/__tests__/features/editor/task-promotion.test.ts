import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";
import {
  promoteSelectedChecklistItem,
  promotedChecklistTaskLinks,
} from "../../../src/features/editor/task-promotion";

function checkDocument(
  checked: boolean,
  text: string,
  taskId: string | null = null,
  blockId: string | null = null,
) {
  return productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", { checked, taskId, blockId }, [
        productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []),
      ]),
    ]),
  ]);
}

function selectedState(document = checkDocument(false, "Ship release")) {
  const state = EditorState.create({ doc: document });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 3)),
  );
}

test("explicit promotion links one selected checklist item", () => {
  const promotion = promoteSelectedChecklistItem(selectedState(), {
    noteId: "note-1",
    taskId: "task-1",
    sourceBlockId: "block-1",
    at: 42,
  });
  assert.ok(promotion);
  assert.deepEqual(promotion.link, {
    taskId: "task-1",
    sourceNoteId: "note-1",
    sourceBlockId: "block-1",
    title: "Ship release",
    status: "todo",
    updatedAt: 42,
  });
  const next = selectedState().apply(promotion.transaction);
  assert.equal(next.doc.firstChild?.firstChild?.attrs.taskId, "task-1");
  assert.equal(next.doc.firstChild?.firstChild?.attrs.blockId, "block-1");
});

test("plain, empty, linked and invalid checklist selections are not promoted", () => {
  const paragraph = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text("Not a task")]),
  ]);
  assert.equal(
    promoteSelectedChecklistItem(selectedState(paragraph), {
      noteId: "note-1",
      taskId: "task-1",
      sourceBlockId: "block-1",
      at: 1,
    }),
    null,
  );
  assert.equal(
    promoteSelectedChecklistItem(selectedState(checkDocument(false, "")), {
      noteId: "note-1",
      taskId: "task-1",
      sourceBlockId: "block-1",
      at: 1,
    }),
    null,
  );
  assert.equal(
    promoteSelectedChecklistItem(
      selectedState(checkDocument(false, "Linked", "task-old", "block-old")),
      {
        noteId: "note-1",
        taskId: "task-new",
        sourceBlockId: "block-new",
        at: 1,
      },
    ),
    null,
  );
  assert.equal(
    promoteSelectedChecklistItem(selectedState(), {
      noteId: "note/1",
      taskId: "task-1",
      sourceBlockId: "block-1",
      at: 1,
    }),
    null,
  );
});

test("synchronization projects only explicitly promoted checklist items", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", { checked: false, taskId: null, blockId: null }, [
        productSchema.node("paragraph", null, [productSchema.text("Local checkbox")]),
      ]),
      productSchema.node(
        "check_item",
        { checked: true, taskId: "task-2", blockId: "block-2" },
        [
          productSchema.node("paragraph", null, [productSchema.text("Promoted checkbox")]),
        ],
      ),
    ]),
  ]);
  assert.deepEqual(promotedChecklistTaskLinks(document, "note-1", 99), [
    {
      taskId: "task-2",
      sourceNoteId: "note-1",
      sourceBlockId: "block-2",
      title: "Promoted checkbox",
      status: "done",
      updatedAt: 99,
    },
  ]);
});

test("promotion and projection use only the checklist summary as the task title", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node(
        "check_item",
        { checked: false, taskId: null, blockId: null },
        [
          productSchema.node("paragraph", null, [productSchema.text("Summary")]),
          productSchema.node("bullet_list", null, [
            productSchema.node("list_item", null, [
              productSchema.node("paragraph", null, [productSchema.text("Nested detail")]),
            ]),
          ]),
        ],
      ),
    ]),
  ]);
  const promotion = promoteSelectedChecklistItem(selectedState(document), {
    noteId: "note-1",
    taskId: "task-1",
    sourceBlockId: "block-1",
    at: 1,
  });
  assert.equal(promotion?.link.title, "Summary");
  assert.ok(promotion);
  const promoted = selectedState(document).apply(promotion.transaction);
  assert.equal(
    promotedChecklistTaskLinks(promoted.doc, "note-1", 1)[0]?.title,
    "Summary",
  );
});

test("promoted checklist linkage survives JSON, DOM and Markdown round trips", () => {
  const original = checkDocument(true, "Keep the link", "task-7", "block-7");
  const fromJson = productSchema.nodeFromJSON(original.toJSON());
  assert.equal(fromJson.firstChild?.firstChild?.attrs.taskId, "task-7");
  assert.equal(fromJson.firstChild?.firstChild?.attrs.blockId, "block-7");

  const item = original.firstChild?.firstChild;
  assert.ok(item);
  const toDOM = productSchema.nodes.check_item?.spec.toDOM;
  assert.ok(toDOM);
  const domSpec = toDOM(item) as [string, Record<string, string>];
  assert.equal(domSpec[1]["data-task-id"], "task-7");
  assert.equal(domSpec[1]["data-block-id"], "block-7");

  const markdown = serializeProductMarkdown(original);
  assert.match(markdown, /<!--skriuw-task:task-7:block-7-->/);
  const fromMarkdown = parseProductMarkdown(markdown);
  assert.equal(fromMarkdown.firstChild?.firstChild?.attrs.taskId, "task-7");
  assert.equal(fromMarkdown.firstChild?.firstChild?.attrs.blockId, "block-7");
  assert.equal(fromMarkdown.textContent, "Keep the link");
});

test("task marker lookalikes outside checklist metadata remain literal Markdown", () => {
  const paragraph = "Keep <!--skriuw-task:task-7:block-7--> literal";
  assert.equal(serializeProductMarkdown(parseProductMarkdown(paragraph)), paragraph);

  const code = "```html\n<!--skriuw-task:task-7:block-7-->\n```";
  assert.equal(serializeProductMarkdown(parseProductMarkdown(code)).trimEnd(), code);
});
