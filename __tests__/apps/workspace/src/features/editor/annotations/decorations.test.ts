import assert from "node:assert/strict";
import { test } from "vitest";
import { history, undo } from "prosemirror-history";
import { Fragment, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import {
  annotationDecorationPluginKey,
  createAnnotationDecorationPlugin,
  resolvedThreadIdsForNote,
  setAnnotationDecorations,
  type AnnotationDecorationInputs,
} from "@/features/editor/annotations/decorations";
import { productSchema } from "@/features/editor/schema";

function requiredAnnotation() {
  const annotation = productSchema.marks.annotation;
  assert.ok(annotation);
  return annotation;
}

function docWithThreads(...threadIds: string[]) {
  const annotation = requiredAnnotation();
  return productSchema.node("doc", null, [
    productSchema.node(
      "paragraph",
      null,
      threadIds.map((threadId) => productSchema.text(threadId, [annotation.create({ threadId })])),
    ),
  ]);
}

function stateWith(doc: ReturnType<typeof productSchema.node>): EditorState {
  return EditorState.create({
    schema: productSchema,
    doc,
    plugins: [createAnnotationDecorationPlugin(), history()],
  });
}

function anchored(text: string, threadId: string): ProseMirrorNode {
  return productSchema.text(text, [requiredAnnotation().create({ threadId })]);
}

function paragraphOf(...content: ProseMirrorNode[]): ProseMirrorNode {
  return productSchema.node("paragraph", null, content);
}

function docOf(...paragraphs: ProseMirrorNode[]): ProseMirrorNode {
  return productSchema.node("doc", null, paragraphs);
}

const PUSHED_INPUTS: AnnotationDecorationInputs = {
  activeThreadId: "unrelated-thread",
  resolvedThreadIds: new Set<string>(),
};

function decorationsOf(state: EditorState): DecorationSet {
  const decorations = annotationDecorationPluginKey.getState(state)?.decorations;
  assert.ok(decorations);
  return decorations;
}

function paintedRanges(state: EditorState): [number, number][] {
  return decorationsOf(state)
    .find()
    .map((decoration): [number, number] => [decoration.from, decoration.to])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

function assertMatchesRebuild(state: EditorState): void {
  assert.deepEqual(
    paintedRanges(state),
    paintedRanges(pushed(stateWith(state.doc), PUSHED_INPUTS)),
  );
}

/** Mirrors the editor's dispatch loop closely enough to drive the plugin. */
function pushed(state: EditorState, inputs: AnnotationDecorationInputs): EditorState {
  let next = state;
  setAnnotationDecorations(
    {
      get state() {
        return next;
      },
      dispatch: (transaction) => {
        next = next.apply(transaction);
      },
    },
    inputs,
  );
  return next;
}

function classesOf(state: EditorState): string[] {
  return decorationsOf(state)
    .find()
    .map((decoration) =>
      String((decoration as { type: { attrs?: { class?: string } } }).type.attrs?.class ?? ""),
    );
}

test("an open thread is tinted and a resolved one is not", () => {
  const state = pushed(stateWith(docWithThreads("open-thread", "done-thread")), {
    activeThreadId: "",
    resolvedThreadIds: new Set(["done-thread"]),
  });

  const classes = classesOf(state);
  assert.equal(classes.length, 2);
  assert.ok(classes[0]?.includes("skriuw-annotation"));
  assert.ok(!classes[0]?.includes("--resolved"));
  assert.ok(classes[1]?.includes("--resolved"));
});

test("the open thread's anchor is the only one that gets the active ring", () => {
  const state = pushed(stateWith(docWithThreads("first", "second")), {
    activeThreadId: "second",
    resolvedThreadIds: new Set<string>(),
  });

  const classes = classesOf(state);
  assert.ok(!classes[0]?.includes("--active"));
  assert.ok(classes[1]?.includes("--active"));
});

test("a resolved thread that is open in the popover still shows as active", () => {
  const state = pushed(stateWith(docWithThreads("only")), {
    activeThreadId: "only",
    resolvedThreadIds: new Set(["only"]),
  });

  assert.ok(classesOf(state)[0]?.includes("--active"));
});

test("appearance is not an edit and never enters history", () => {
  const state = stateWith(docWithThreads("only"));
  let history: unknown;
  setAnnotationDecorations(
    {
      get state() {
        return state;
      },
      dispatch: (transaction) => {
        history = transaction.getMeta("addToHistory");
      },
    },
    { activeThreadId: "only", resolvedThreadIds: new Set<string>() },
  );

  assert.equal(history, false);
});

test("an unchanged push dispatches nothing", () => {
  const inputs: AnnotationDecorationInputs = {
    activeThreadId: "only",
    resolvedThreadIds: new Set(["other"]),
  };
  const state = pushed(stateWith(docWithThreads("only")), inputs);
  let dispatched = false;
  setAnnotationDecorations(
    {
      get state() {
        return state;
      },
      dispatch: () => {
        dispatched = true;
      },
    },
    { activeThreadId: "only", resolvedThreadIds: new Set(["other"]) },
  );

  assert.equal(dispatched, false);
});

test("an anchor restored by undo is repainted without a fresh push", () => {
  const annotation = requiredAnnotation();
  const state = pushed(stateWith(docWithThreads("only")), {
    activeThreadId: "",
    resolvedThreadIds: new Set<string>(),
  });

  const stripped = state.apply(state.tr.removeMark(0, state.doc.content.size, annotation));
  assert.equal(classesOf(stripped).length, 0);

  const restored = stripped.apply(
    stripped.tr.addMark(1, stripped.doc.content.size - 1, annotation.create({ threadId: "only" })),
  );
  assert.equal(classesOf(restored).length, 1);
});

test("typing in a note without anchors keeps the empty decoration set", () => {
  const state = pushed(
    stateWith(docOf(paragraphOf(productSchema.text("plain text")))),
    PUSHED_INPUTS,
  );
  assert.equal(decorationsOf(state), DecorationSet.empty);

  const next = state.apply(state.tr.insertText("x", 3));
  assert.equal(decorationsOf(next), DecorationSet.empty);
});

test("typing in a paragraph without anchors paints the same anchors as a rebuild", () => {
  const state = pushed(
    stateWith(
      docOf(
        paragraphOf(anchored("first", "t1"), productSchema.text(" tail")),
        paragraphOf(productSchema.text("plain middle")),
        paragraphOf(anchored("last", "t2")),
      ),
    ),
    PUSHED_INPUTS,
  );
  const middle = state.doc.child(0).nodeSize + 3;
  const next = state.apply(state.tr.insertText("typed ", middle));

  assert.equal(paintedRanges(next).length, 2);
  assertMatchesRebuild(next);
});

test("undo restoring a deleted anchor paints it again", () => {
  let state = pushed(
    stateWith(docOf(paragraphOf(productSchema.text("keep "), anchored("note", "t1")))),
    PUSHED_INPUTS,
  );
  state = state.apply(state.tr.delete(6, 10));
  assert.equal(paintedRanges(state).length, 0);

  assert.ok(
    undo(state, (transaction) => {
      state = state.apply(transaction);
    }),
  );
  assert.deepEqual(paintedRanges(state), [[6, 10]]);
});

test("pasting a slice that carries an anchor paints the new anchor", () => {
  const state = pushed(stateWith(docOf(paragraphOf(productSchema.text("plain")))), PUSHED_INPUTS);
  const slice = new Slice(Fragment.from(anchored("pasted", "t1")), 0, 0);
  const next = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 3)).replaceSelection(slice),
  );

  assert.deepEqual(paintedRanges(next), [[3, 9]]);
  assertMatchesRebuild(next);
});

test("deleting the text between two runs of one thread paints the joined run", () => {
  const state = pushed(
    stateWith(
      docOf(paragraphOf(anchored("one", "t1"), productSchema.text(" gap "), anchored("two", "t1"))),
    ),
    PUSHED_INPUTS,
  );
  assert.equal(paintedRanges(state).length, 2);

  const next = state.apply(state.tr.delete(4, 9));
  assert.deepEqual(paintedRanges(next), [[1, 7]]);
  assertMatchesRebuild(next);
});

test("resolved ids are scoped to the note being edited", () => {
  const annotations = new Map([
    ["a", { noteId: "note-1", status: "resolved" }],
    ["b", { noteId: "note-1", status: "open" }],
    ["c", { noteId: "note-2", status: "resolved" }],
  ]);

  assert.deepEqual([...resolvedThreadIdsForNote(annotations, "note-1")], ["a"]);
  assert.deepEqual([...resolvedThreadIdsForNote(annotations, null)], []);
});
