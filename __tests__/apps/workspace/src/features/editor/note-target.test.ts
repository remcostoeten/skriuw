import assert from "node:assert/strict";
import { test } from "vitest";
import { TextSelection } from "prosemirror-state";
import {
  actionInputRange,
  actionInputText,
  appendTaskPlanTransaction,
  replaceRangeTransaction,
} from "@/features/ai/actions/apply";
import { createBoundedDocument, type BoundedDocument } from "@/features/editor/document/bounded";
import { boundedNoteTarget } from "@/features/editor/note-target";
import { productSchema, serializeProductMarkdown } from "@/features/editor/schema";

function largeNote(): BoundedDocument {
  return createBoundedDocument(
    productSchema.node(
      "doc",
      null,
      Array.from({ length: 250 }, (_, index) =>
        productSchema.node("paragraph", null, productSchema.text(`Block ${index + 1}`)),
      ),
    ),
  );
}

function countingTarget(bounded: BoundedDocument) {
  const calls = { replaced: 0 };
  const target = boundedNoteTarget(bounded, () => {
    calls.replaced += 1;
  });
  return { target, calls };
}

test("a note action reads every block of a bounded note, not just the window", () => {
  const { target } = countingTarget(largeNote());
  const input = actionInputText(target.state, "note");

  assert.match(input, /Block 1\b/);
  assert.match(input, /Block 250/);
});

test("a note action's range spans the full document", () => {
  const bounded = largeNote();
  const { target } = countingTarget(bounded);

  assert.deepEqual(actionInputRange(target.state, "note"), {
    from: 0,
    to: bounded.fullDocument().content.size,
  });
});

test("appended tasks land after the last block, outside the mounted window", () => {
  const bounded = largeNote();
  const { target, calls } = countingTarget(bounded);
  const windowBefore = bounded.windowDocument();
  const transaction = appendTaskPlanTransaction(target.state, [
    { key: "a", text: "Book the venue" },
  ]);
  assert.ok(transaction);

  target.dispatch(transaction);

  const full = bounded.fullDocument();
  assert.equal(full.childCount, 251);
  assert.equal(full.child(249).textContent, "Block 250");
  assert.equal(full.lastChild?.type.name, "check_list");
  assert.equal(full.lastChild?.textContent, "Book the venue");
  assert.match(serializeProductMarkdown(full), /Block 250[\s\S]*Book the venue/);
  assert.ok(bounded.windowDocument().eq(windowBefore));
  assert.equal(calls.replaced, 1);
});

test("replacing the whole note records one bounded undo entry that restores it", () => {
  const bounded = largeNote();
  const original = bounded.fullDocument();
  const { target, calls } = countingTarget(bounded);
  const range = actionInputRange(target.state, "note");
  const depth = bounded.undoDepth();

  target.dispatch(replaceRangeTransaction(target.state, range.from, range.to, "Short summary"));

  assert.equal(bounded.blockCount(), 1);
  assert.equal(bounded.fullDocument().textContent, "Short summary");
  assert.equal(bounded.undoDepth(), depth + 1);
  assert.equal(calls.replaced, 1);
  assert.equal(bounded.undo(), true);
  assert.ok(bounded.fullDocument().eq(original));
});

test("a selection-only transaction leaves the note and its history alone", () => {
  const bounded = largeNote();
  const { target, calls } = countingTarget(bounded);
  const depth = bounded.undoDepth();

  target.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 3)));

  assert.equal(calls.replaced, 0);
  assert.equal(bounded.undoDepth(), depth);
  assert.equal(target.state.selection.from, 3);
});
