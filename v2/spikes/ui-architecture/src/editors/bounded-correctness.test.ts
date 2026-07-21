import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNDED_EDITOR_UNSUPPORTED,
  createBoundedEditorProjection,
} from "./bounded-correctness.ts";

function createCorpus(count: number): { kind: "paragraph"; text: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "paragraph" as const,
    text: `block ${index}`,
  }));
}

test("window movement preserves the focused block and scroll anchor", () => {
  const projection = createBoundedEditorProjection(createCorpus(500), 16);
  projection.focus({ blockIndex: 125, offset: 4 });
  projection.setScrollTop(500);
  projection.moveWindow(120);
  const state = projection.getWindow();
  assert.equal(state.start, 120);
  assert.equal(state.selection?.blockIndex, 125);
  assert.equal(state.selection?.offset, 4);
  assert.equal(state.scrollTop, 0);
  assert.equal(state.focused, true);
});

test("edits reconcile into canonical content and remain visible", () => {
  const projection = createBoundedEditorProjection(createCorpus(50), 16);
  projection.applyEditorEdit({ blockIndex: 3, text: "canonical edit" });
  assert.equal(projection.getRenderedBlocks()[3]?.text, "canonical edit");
  projection.reconcileCanonical({ blockIndex: 3, text: "remote canonical edit" });
  assert.equal(projection.getRenderedBlocks()[3]?.text, "remote canonical edit");
});

test("focus can be restored after a window move and blur is explicit", () => {
  const projection = createBoundedEditorProjection(createCorpus(500), 16);
  projection.focus({ blockIndex: 250, offset: 9 });
  projection.moveWindow(242);
  assert.deepEqual(projection.getWindow().selection, { blockIndex: 250, offset: 9 });
  projection.blur();
  assert.equal(projection.getWindow().focused, false);
});

test("editing outside the rendered window is rejected", () => {
  const projection = createBoundedEditorProjection(createCorpus(50), 8);
  assert.throws(() => projection.applyEditorEdit({ blockIndex: 20, text: "nope" }), /outside/);
});

test("unsupported cross-window semantics stay explicit", () => {
  assert.deepEqual(BOUNDED_EDITOR_UNSUPPORTED, [
    "cross-window clipboard and find",
    "IME composition spanning a window move",
    "cross-window undo history",
    "screen-reader traversal outside the rendered window",
  ]);
});
