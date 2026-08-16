import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";
import { taskPromotionOperations } from "../../../src/features/editor/task-linking";

function stateWithText(text = ""): EditorState {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, plugins: createProductPlugins() });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)));
}

function type(state: EditorState, text: string): EditorState {
  let current = state;
  for (const character of text) {
    const view = {
      composing: false,
      get state() { return current; },
      dispatch(transaction: Transaction) { current = current.apply(transaction); },
    };
    const { from, to } = current.selection;
    const handled = current.plugins.some((plugin) => {
      const input = (plugin.props as { handleTextInput?: (view: unknown, from: number, to: number, text: string) => boolean }).handleTextInput;
      return input?.call(plugin, view, from, to, character) ?? false;
    });
    if (!handled) current = current.apply(current.tr.insertText(character, from, to));
  }
  return current;
}

test("bullet checkbox gesture creates a linked task while paragraph shorthand stays unlinked", () => {
  const taskState = type(stateWithText(), "- [] ");
  const item = taskState.doc.firstChild?.firstChild;
  assert.equal(taskState.doc.firstChild?.type.name, "check_list");
  assert.equal(item?.type.name, "check_item");
  assert.match(String(item?.attrs.taskId), /^[A-Za-z0-9_-]{1,128}$/);
  assert.match(String(item?.attrs.blockId), /^[A-Za-z0-9_-]{1,128}$/);
  assert.notEqual(item?.attrs.taskId, item?.attrs.blockId);

  const checkboxState = type(stateWithText(), "[] ");
  assert.equal(checkboxState.doc.firstChild?.firstChild?.attrs.taskId, null);
  assert.equal(checkboxState.doc.firstChild?.firstChild?.attrs.blockId, null);
});

test("linked tasks use a same-line marker only after a title exists", () => {
  const linked = productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", { checked: false, taskId: "task-1", blockId: "block-1" }, [
        productSchema.node("paragraph", null, [productSchema.text("Plan release")]),
      ]),
      productSchema.node("check_item", { checked: false, taskId: "task-2", blockId: "block-2" }, [
        productSchema.node("paragraph"),
      ]),
    ]),
  ]);
  const markdown = serializeProductMarkdown(linked);
  assert.match(markdown, /Plan release <!--skriuw-task:task-1:block-1-->/);
  assert.doesNotMatch(markdown, /task-2/);
});

test("promotion operations skip empty and already-recorded task links", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", { checked: false, taskId: "task-1", blockId: "block-1" }, [
        productSchema.node("paragraph", null, [productSchema.text("Ship")]),
      ]),
    ]),
  ]);
  const operations = taskPromotionOperations(document, "note-1", {
    documentJson: document.toJSON(), markdown: "- [ ] Ship", wordCount: 1, expectedRevision: 4,
  }, new Map(), 10);
  assert.equal(operations.length, 1);
  const first = operations[0];
  assert.ok(first && first.type === "promote_checklist_task");
  const known = new Map([["task-1", first.task]]);
  assert.equal(taskPromotionOperations(document, "note-1", {
    documentJson: document.toJSON(), markdown: "- [ ] Ship", wordCount: 1, expectedRevision: 4,
  }, known, 10).length, 0);
});

test("only the first promotion in a batch carries the document", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", { checked: false, taskId: "task-1", blockId: "block-1" }, [
        productSchema.node("paragraph", null, [productSchema.text("First")]),
      ]),
      productSchema.node("check_item", { checked: true, taskId: "task-2", blockId: "block-2" }, [
        productSchema.node("paragraph", null, [productSchema.text("Second")]),
      ]),
      productSchema.node("check_item", { checked: false, taskId: "task-3", blockId: "block-3" }, [
        productSchema.node("paragraph", null, [productSchema.text("Third")]),
      ]),
    ]),
  ]);
  const operations = taskPromotionOperations(document, "note-1", {
    documentJson: document.toJSON(),
    markdown: "- [ ] First\n- [x] Second\n- [ ] Third",
    wordCount: 3,
    expectedRevision: 4,
  }, new Map(), 10);

  assert.equal(operations.length, 3);
  assert.equal(operations.filter((operation) => operation.type === "promote_checklist_task").length, 1);
  assert.equal(operations[0]?.type, "promote_checklist_task");
  assert.equal(operations[1]?.type, "create_task");
  assert.equal(operations[2]?.type, "create_task");
  assert.deepEqual(
    operations.map((operation) => (operation.type === "promote_checklist_task" || operation.type === "create_task" ? operation.task.id : null)),
    ["task-1", "task-2", "task-3"],
  );
  const second = operations[1];
  assert.ok(second && second.type === "create_task");
  assert.equal(second.task.status, "done");
  assert.deepEqual(second.task.source, { noteId: "note-1", blockId: "block-2" });
});
