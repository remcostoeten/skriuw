import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState as SourceState, Annotation } from "@codemirror/state";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  sourceUpdateMovesCaret,
  transactionMovesCaret,
  typewriterScrollTop,
  type TypewriterGeometry,
} from "@/features/editor/focus/typewriter-scroll";
import { REMOTE_APPLY_META } from "@/features/editor/document/remote-merge";
import { productSchema } from "@/features/editor/schema";

function geometry(overrides: Partial<TypewriterGeometry> = {}): TypewriterGeometry {
  return {
    caretTop: 390,
    caretBottom: 410,
    containerTop: 0,
    containerHeight: 800,
    scrollTop: 1000,
    scrollHeight: 5000,
    ...overrides,
  };
}

function editorState() {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("first")),
    productSchema.node("paragraph", null, productSchema.text("second")),
  ]);
  return EditorState.create({ doc });
}

test("a caret already in the middle needs no scroll write", () => {
  assert.equal(typewriterScrollTop(geometry()), null);
  assert.equal(typewriterScrollTop(geometry({ caretTop: 391, caretBottom: 411 })), null);
});

test("a caret below the middle scrolls down by the difference", () => {
  assert.equal(typewriterScrollTop(geometry({ caretTop: 590, caretBottom: 610 })), 1200);
});

test("a caret above the middle scrolls up by the difference", () => {
  assert.equal(typewriterScrollTop(geometry({ caretTop: 90, caretBottom: 110 })), 700);
});

test("the container's own offset in the window is accounted for", () => {
  assert.equal(
    typewriterScrollTop(geometry({ containerTop: 44, caretTop: 434, caretBottom: 454 })),
    null,
  );
});

test("the target is clamped to the scrollable range", () => {
  assert.equal(typewriterScrollTop(geometry({ scrollTop: 50, caretTop: 0, caretBottom: 20 })), 0);
  assert.equal(
    typewriterScrollTop(geometry({ scrollTop: 4100, caretTop: 790, caretBottom: 810 })),
    4200,
  );
  assert.equal(
    typewriterScrollTop(
      geometry({ scrollTop: 0, scrollHeight: 800, caretTop: 700, caretBottom: 720 }),
    ),
    null,
  );
});

test("typing and keyboard caret moves request centering in the rendered editor", () => {
  const state = editorState();
  assert.equal(transactionMovesCaret(state.tr.insertText("x", 1)), true);
  assert.equal(
    transactionMovesCaret(state.tr.setSelection(TextSelection.create(state.doc, 10))),
    true,
  );
});

test("pointer selections, remote merges, and meta-only transactions do not", () => {
  const state = editorState();
  assert.equal(
    transactionMovesCaret(
      state.tr.setSelection(TextSelection.create(state.doc, 10)).setMeta("pointer", true),
    ),
    false,
  );
  assert.equal(
    transactionMovesCaret(state.tr.insertText("x", 1).setMeta(REMOTE_APPLY_META, true)),
    false,
  );
  assert.equal(transactionMovesCaret(state.tr.setMeta("addToHistory", false)), false);
});

const external = Annotation.define<boolean>();

function isExternal(transaction: ReturnType<SourceState["update"]>): boolean {
  return transaction.annotation(external) === true;
}

test("raw Markdown edits and keyboard moves request centering", () => {
  const state = SourceState.create({ doc: "one\ntwo" });
  const typed = state.update({ changes: { from: 3, insert: "!" }, userEvent: "input.type" });
  assert.equal(
    sourceUpdateMovesCaret(
      { docChanged: true, selectionSet: true, transactions: [typed] },
      isExternal,
    ),
    true,
  );
  const moved = state.update({ selection: { anchor: 5 }, userEvent: "select" });
  assert.equal(
    sourceUpdateMovesCaret(
      { docChanged: false, selectionSet: true, transactions: [moved] },
      isExternal,
    ),
    true,
  );
});

test("raw Markdown pointer selections and document swaps do not", () => {
  const state = SourceState.create({ doc: "one\ntwo" });
  const clicked = state.update({ selection: { anchor: 5 }, userEvent: "select.pointer" });
  assert.equal(
    sourceUpdateMovesCaret(
      { docChanged: false, selectionSet: true, transactions: [clicked] },
      isExternal,
    ),
    false,
  );
  const swapped = state.update({
    changes: { from: 0, to: state.doc.length, insert: "other note" },
    annotations: external.of(true),
  });
  assert.equal(
    sourceUpdateMovesCaret(
      { docChanged: true, selectionSet: false, transactions: [swapped] },
      isExternal,
    ),
    false,
  );
  assert.equal(
    sourceUpdateMovesCaret(
      { docChanged: false, selectionSet: false, transactions: [] },
      isExternal,
    ),
    false,
  );
});
