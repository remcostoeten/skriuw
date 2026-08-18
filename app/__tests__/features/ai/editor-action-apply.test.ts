import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";
import {
  actionInputRange,
  actionInputText,
  appendTagPlanTransaction,
  appendTaskPlanTransaction,
  currentInputText,
  insertBelowTransaction,
  replaceRangeTransaction,
} from "../../../src/features/ai/editor-action-apply";
import type { AiActionTarget } from "../../../src/features/ai/editor-action-model";

function paragraphs(...texts: readonly string[]): EditorState {
  return EditorState.create({
    doc: productSchema.node(
      "doc",
      null,
      texts.map((text) => productSchema.node("paragraph", null, productSchema.text(text))),
    ),
  });
}

function withSelection(state: EditorState, from: number, to: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

test("a selection travels as the text the writer can see highlighted", () => {
  const state = withSelection(paragraphs("hello world"), 1, 6);

  assert.equal(actionInputText(state, "selection"), "hello");
  assert.deepEqual(actionInputRange(state, "selection"), { from: 1, to: 6 });
});

test("continuing sends only what precedes the caret", () => {
  const state = withSelection(paragraphs("first", "second"), 4, 4);

  assert.equal(actionInputText(state, "caret"), "fir");
  assert.deepEqual(actionInputRange(state, "caret"), { from: 4, to: 4 });
});

test("a whole-note action sends the note's Markdown and owns the whole document", () => {
  const state = paragraphs("alpha", "beta");

  assert.equal(actionInputText(state, "note"), serializeProductMarkdown(state.doc));
  assert.deepEqual(actionInputRange(state, "note"), { from: 0, to: state.doc.content.size });
});

test("re-reading the captured range detects a note that changed underneath", () => {
  const state = withSelection(paragraphs("hello world"), 1, 6);
  const target: AiActionTarget = { noteId: "n", from: 1, to: 6, input: "hello" };

  assert.equal(currentInputText(state, target, "selection"), "hello");
  const edited = state.apply(state.tr.insertText("X", 1, 2));
  assert.notEqual(currentInputText(edited, target, "selection"), "hello");
  const shrunk = state.apply(state.tr.delete(1, state.doc.content.size - 1));
  assert.equal(currentInputText(shrunk, { ...target, to: 50 }, "selection"), null);
});

test("accepting a replacement is exactly one transaction", () => {
  const state = withSelection(paragraphs("hello world"), 1, 6);
  const transaction = replaceRangeTransaction(state, 1, 6, "goodbye");
  const next = state.apply(transaction);

  assert.equal(transaction.steps.length >= 1, true);
  assert.equal(next.doc.textContent, "goodbye world");
  assert.equal(state.doc.textContent, "hello world");
});

test("Markdown in a result becomes real blocks rather than literal syntax", () => {
  const state = withSelection(paragraphs("placeholder"), 1, 12);
  const next = state.apply(replaceRangeTransaction(state, 1, 12, "# Title\n\n- one\n- two"));

  assert.equal(next.doc.firstChild?.type.name, "heading");
  assert.equal(next.doc.firstChild?.textContent, "Title");
  assert.match(serializeProductMarkdown(next.doc), /^[-*] one$/m);
});

test("plain prose with blank lines becomes separate paragraphs", () => {
  const state = withSelection(paragraphs("x"), 1, 2);
  const next = state.apply(replaceRangeTransaction(state, 1, 2, "first line\n\nsecond line"));

  assert.equal(next.doc.childCount, 2);
  assert.equal(next.doc.child(0).textContent, "first line");
  assert.equal(next.doc.child(1).textContent, "second line");
});

test("inserting below leaves the original text in place", () => {
  const state = withSelection(paragraphs("keep me", "after"), 1, 8);
  const next = state.apply(insertBelowTransaction(state, 8, "added"));

  assert.equal(next.doc.child(0).textContent, "keep me");
  assert.equal(next.doc.child(1).textContent, "added");
  assert.equal(next.doc.child(2).textContent, "after");
});

test("a confirmed task plan appends checklist items with distinct identities", () => {
  const state = paragraphs("notes");
  const transaction = appendTaskPlanTransaction(state, [
    { key: "a", text: "Call the printer" },
    { key: "b", text: "Send the invoice" },
  ]);
  assert.ok(transaction);
  const next = state.apply(transaction);
  const list = next.doc.child(next.doc.childCount - 1);

  assert.equal(list.type.name, "check_list");
  assert.equal(list.childCount, 2);
  const ids = new Set<string>();
  list.forEach((item) => {
    assert.equal(item.type.name, "check_item");
    assert.equal(item.attrs.checked, false);
    assert.equal(typeof item.attrs.taskId, "string");
    assert.equal(typeof item.attrs.blockId, "string");
    assert.notEqual(item.attrs.taskId, item.attrs.blockId);
    ids.add(String(item.attrs.taskId));
    ids.add(String(item.attrs.blockId));
  });
  assert.equal(ids.size, 4);
  assert.equal(appendTaskPlanTransaction(state, []), null);
});

test("a confirmed tag plan appends reference chips carrying the tag identities", () => {
  const state = paragraphs("notes");
  const transaction = appendTagPlanTransaction(state, [
    { id: "tag-1", name: "recipes" },
    { id: "tag-2", name: "home-cooking" },
  ]);
  assert.ok(transaction);
  const next = state.apply(transaction);

  const chips: string[] = [];
  next.doc.descendants((node) => {
    if (node.type.name === "tag_ref") {
      chips.push(`${node.attrs.id}:${node.attrs.label}`);
    }
  });
  assert.deepEqual(chips, ["tag-1:recipes", "tag-2:home-cooking"]);
  assert.equal(appendTagPlanTransaction(state, []), null);
});
