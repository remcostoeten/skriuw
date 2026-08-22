import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import {
  annotationDecorationPluginKey,
  createAnnotationDecorationPlugin,
  resolvedThreadIdsForNote,
  setAnnotationDecorations,
  type AnnotationDecorationInputs,
} from "../../../src/features/editor/annotation-decorations";
import { productSchema } from "../../../src/features/editor/schema";

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
      threadIds.map((threadId) =>
        productSchema.text(threadId, [annotation.create({ threadId })]),
      ),
    ),
  ]);
}

function stateWith(doc: ReturnType<typeof productSchema.node>): EditorState {
  return EditorState.create({
    schema: productSchema,
    doc,
    plugins: [createAnnotationDecorationPlugin()],
  });
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
  const decorations = annotationDecorationPluginKey.getState(state)
    ?.decorations as DecorationSet | undefined;
  assert.ok(decorations);
  return decorations
    .find()
    .map((decoration) => String((decoration as { type: { attrs?: { class?: string } } }).type.attrs?.class ?? ""));
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
    stripped.tr.addMark(
      1,
      stripped.doc.content.size - 1,
      annotation.create({ threadId: "only" }),
    ),
  );
  assert.equal(classesOf(restored).length, 1);
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
