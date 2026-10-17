import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { changedRanges } from "@/features/editor/changed-ranges";
import { productSchema } from "@/features/editor/schema";

function paragraph(text: string): ProseMirrorNode {
  return productSchema.node("paragraph", null, [productSchema.text(text)]);
}

function stateWith(...blocks: ProseMirrorNode[]): EditorState {
  return EditorState.create({ doc: productSchema.node("doc", null, blocks) });
}

test("inserting one character in the first paragraph changes one range inside it", () => {
  const state = stateWith(paragraph("intro"), paragraph("middle"), paragraph("outro"));
  const ranges = changedRanges(state.tr.insertText("x", 3));
  assert.equal(ranges.length, 1);
  const [range] = ranges;
  assert.ok(range);
  assert.ok(range.from >= 1);
  assert.ok(range.to <= 1 + "intro".length + 1);
});

test("a selection-only transaction changes no ranges", () => {
  const state = stateWith(paragraph("intro"), paragraph("outro"));
  const transaction = state.tr.setSelection(TextSelection.create(state.doc, 3));
  assert.deepEqual(changedRanges(transaction), []);
});
