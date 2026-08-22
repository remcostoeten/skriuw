import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  annotationAtCursor,
  annotationRanges,
} from "../../../src/features/editor/annotation-menu";
import { productSchema } from "../../../src/features/editor/schema";

function requiredAnnotation() {
  const annotation = productSchema.marks.annotation;
  assert.ok(annotation);
  return annotation;
}

function stateWith(doc: ReturnType<typeof productSchema.node>): EditorState {
  return EditorState.create({ schema: productSchema, doc });
}

function withCursor(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

test("an anchor split by another mark reads back as one range", () => {
  const annotation = requiredAnnotation();
  const strong = productSchema.marks.strong;
  assert.ok(strong);
  const mark = annotation.create({ threadId: "thread-1" });
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("start ", []),
      productSchema.text("plain", [mark]),
      productSchema.text("bold", [mark, strong.create()]),
    ]),
  ]);

  const ranges = annotationRanges(stateWith(doc));
  assert.equal(ranges.length, 1, "adjacent runs of one thread should merge");
  assert.equal(ranges[0]?.threadId, "thread-1");
});

test("two threads on adjacent text stay separate ranges", () => {
  const annotation = requiredAnnotation();
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("first", [annotation.create({ threadId: "thread-a" })]),
      productSchema.text("second", [annotation.create({ threadId: "thread-b" })]),
    ]),
  ]);

  const ranges = annotationRanges(stateWith(doc));
  assert.deepEqual(
    ranges.map((range) => range.threadId),
    ["thread-a", "thread-b"],
  );
});

test("the caret inside overlapping threads picks the innermost", () => {
  const annotation = requiredAnnotation();
  const outer = annotation.create({ threadId: "outer" });
  const inner = annotation.create({ threadId: "inner" });
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("wide ", [outer]),
      productSchema.text("narrow", [outer, inner]),
      productSchema.text(" tail", [outer]),
    ]),
  ]);
  const state = stateWith(doc);
  const innerRange = annotationRanges(state).find((range) => range.threadId === "inner");
  assert.ok(innerRange);

  const cursor = withCursor(state, innerRange.from + 1);
  assert.equal(annotationAtCursor(cursor)?.threadId, "inner");
});

test("a caret outside every anchor resolves to no thread", () => {
  const annotation = requiredAnnotation();
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("before "),
      productSchema.text("anchored", [annotation.create({ threadId: "thread-1" })]),
    ]),
  ]);
  const state = stateWith(doc);

  assert.equal(annotationAtCursor(withCursor(state, 2)), null);
});

test("a non-empty selection never resolves to a thread at the cursor", () => {
  const annotation = requiredAnnotation();
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("anchored", [annotation.create({ threadId: "thread-1" })]),
    ]),
  ]);
  const state = stateWith(doc);
  const selected = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 2, 5)),
  );

  assert.equal(annotationAtCursor(selected), null);
});
