import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  bubbleMenuStateEqual,
  closedBubbleMenu,
  setHighlightColor,
  setTextAlignment,
} from "../../src/editor/bubble-menu";
import { productSchema } from "../../src/editor/schema";

function selectedState(text: string): EditorState {
  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text(text)]),
  ]);
  const state = EditorState.create({ doc: document });
  return state.apply(state.tr.setSelection(TextSelection.create(document, 1, text.length + 1)));
}

function runCommand(state: EditorState, command: ReturnType<typeof setHighlightColor>): EditorState {
  let next = state;
  assert.equal(command(state, (transaction) => {
    next = next.apply(transaction);
  }), true);
  return next;
}

test("choosing a different highlight color replaces the selected highlight", () => {
  const blue = runCommand(selectedState("Marked"), setHighlightColor("blue"));
  const pink = runCommand(blue, setHighlightColor("pink"));
  const highlight = productSchema.marks.highlight;
  assert.ok(highlight);
  assert.ok(pink.doc.rangeHasMark(1, 7, highlight));
  const mark = highlight.isInSet(pink.doc.firstChild?.firstChild?.marks ?? []);
  assert.equal(mark?.attrs.color, "pink");
});

test("alignment applies to every selected text block", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text("One")]),
    productSchema.node("heading", { level: 2 }, [productSchema.text("Two")]),
  ]);
  let state = EditorState.create({ doc: document });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));
  let aligned = state;
  assert.equal(setTextAlignment("center")(state, (transaction) => {
    aligned = aligned.apply(transaction);
  }), true);
  assert.equal(aligned.doc.firstChild?.attrs.textAlign, "center");
  assert.equal(aligned.doc.lastChild?.attrs.textAlign, "center");
});

test("bubble menu state comparison skips equivalent React updates", () => {
  assert.equal(bubbleMenuStateEqual(closedBubbleMenu, { ...closedBubbleMenu }), true);
  assert.equal(
    bubbleMenuStateEqual(closedBubbleMenu, { ...closedBubbleMenu, underline: true }),
    false,
  );
});
