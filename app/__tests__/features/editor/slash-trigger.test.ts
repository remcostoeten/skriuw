import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  createProductPlugins,
  productSchema,
  slashMenuState,
} from "../../../src/features/editor/schema";

function stateAfterTyping(text: string): EditorState {
  const doc = productSchema.node("doc", null, [productSchema.node("paragraph")]);
  const state = EditorState.create({ doc, plugins: createProductPlugins() });
  const transaction = state.tr.insertText(text, 1);
  transaction.setSelection(
    TextSelection.create(transaction.doc, transaction.doc.content.size - 1),
  );
  return state.apply(transaction);
}

test("the slash trigger opens the block menu", () => {
  const menu = slashMenuState(stateAfterTyping("some text /quo"));
  assert.deepEqual(menu, { open: true, trigger: "/", query: "quo" });
});

test("the colon trigger opens the emoji menu once a query is typed", () => {
  assert.deepEqual(slashMenuState(stateAfterTyping("ship it :roc")), {
    open: true,
    trigger: ":",
    query: "roc",
  });
});

test("a bare colon never opens the emoji menu", () => {
  assert.equal(slashMenuState(stateAfterTyping("Steps:")).open, false);
  assert.equal(slashMenuState(stateAfterTyping("Steps :")).open, false);
});

test("a colon inside a word or a time never triggers", () => {
  assert.equal(slashMenuState(stateAfterTyping("TODO:fix")).open, false);
  assert.equal(slashMenuState(stateAfterTyping("meet at 10:30")).open, false);
  assert.equal(slashMenuState(stateAfterTyping("https://example.com")).open, false);
});

test("neither trigger fires inside a code block", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("code_block", null, [productSchema.text("value :roc")]),
  ]);
  const state = EditorState.create({ doc, plugins: createProductPlugins() });
  const applied = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );
  assert.equal(slashMenuState(applied).open, false);
});
