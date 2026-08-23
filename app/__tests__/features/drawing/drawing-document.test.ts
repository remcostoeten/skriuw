import assert from "node:assert/strict";
import test from "node:test";
import { history, redo, undo } from "prosemirror-history";
import { EditorState, type Transaction } from "prosemirror-state";
import {
  type DrawingLayer,
  parseDrawingLayer,
} from "../../../src/features/editor/drawing-layer";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";
import { documentSaveOperations } from "../../../src/features/editor/task-linking";

function stroke(id: string, points: number[]) {
  return { id, kind: "stroke" as const, tool: "pen" as const, color: "ink", width: 2, points };
}

function layerWith(...elements: DrawingLayer["elements"]): DrawingLayer {
  return { version: 1, elements };
}

function editorState(): EditorState {
  return EditorState.create({
    schema: productSchema,
    doc: productSchema.node("doc", null, [
      productSchema.node("paragraph", null, [productSchema.text("Reviewed the diagram")]),
    ]),
    plugins: [history()],
  });
}

function apply(state: EditorState, transaction: Transaction): EditorState {
  return state.apply(transaction);
}

test("a drawing edit is a document change, so the editor's save path picks it up", () => {
  const state = editorState();
  const layer = layerWith(stroke("s1", [10, 20, 30, 40]));

  const transaction = state.tr.setDocAttribute("drawing", layer);

  assert.equal(transaction.docChanged, true, "the save debounce keys off docChanged");
  assert.deepEqual(apply(state, transaction).doc.attrs.drawing, layer);
});

test("each stroke is its own undo step and leaves the text untouched", () => {
  let state = editorState();
  const text = state.doc.textContent;

  state = apply(state, state.tr.setDocAttribute("drawing", layerWith(stroke("s1", [0, 0, 1, 1]))));
  state = apply(
    state,
    state.tr.setDocAttribute(
      "drawing",
      layerWith(stroke("s1", [0, 0, 1, 1]), stroke("s2", [5, 5, 6, 6])),
    ),
  );
  assert.equal(parseDrawingLayer(state.doc.attrs.drawing)?.elements.length, 2);

  undo(state, (transaction) => {
    state = apply(state, transaction);
  });

  assert.equal(
    parseDrawingLayer(state.doc.attrs.drawing)?.elements.length,
    1,
    "undo removes the last stroke, not the whole layer",
  );
  assert.equal(state.doc.textContent, text);

  redo(state, (transaction) => {
    state = apply(state, transaction);
  });

  assert.equal(parseDrawingLayer(state.doc.attrs.drawing)?.elements.length, 2);
});

test("undoing the first stroke returns the note to having no layer", () => {
  let state = editorState();
  state = apply(state, state.tr.setDocAttribute("drawing", layerWith(stroke("s1", [0, 0, 1, 1]))));

  undo(state, (transaction) => {
    state = apply(state, transaction);
  });

  assert.equal(state.doc.attrs.drawing, null);
});

test("a drawn note saves its ink through the ordinary document write", () => {
  const layer = layerWith(stroke("s1", [10, 20, 30, 40]));
  const document = productSchema.node("doc", { drawing: layer }, [
    productSchema.node("paragraph", null, [productSchema.text("Reviewed")]),
  ]);

  const operations = documentSaveOperations(
    document,
    "note-1",
    {
      documentJson: document.toJSON(),
      markdown: serializeProductMarkdown(document),
      wordCount: 1,
      expectedRevision: 3,
    },
    new Map(),
    10,
  );

  assert.equal(operations.length, 1);
  const save = operations[0];
  assert.ok(save && save.type === "save_document");
  const written = save.documentJson as { attrs?: { drawing?: unknown } };
  assert.deepEqual(written.attrs?.drawing, layer, "the layer rides the document write");
  assert.match(save.markdown, /```drawing/);
  assert.deepEqual(parseProductMarkdown(save.markdown).attrs.drawing, layer);
});

test("text edits made after drawing keep the ink", () => {
  let state = editorState();
  const layer = layerWith(stroke("s1", [0, 0, 1, 1]));
  state = apply(state, state.tr.setDocAttribute("drawing", layer));

  state = apply(state, state.tr.insertText(" again", state.doc.content.size - 1));

  assert.deepEqual(state.doc.attrs.drawing, layer);
  assert.match(state.doc.textContent, /again/);
});
