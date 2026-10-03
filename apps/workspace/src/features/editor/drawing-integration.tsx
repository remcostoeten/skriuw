import { redo, undo } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import type { DrawingDocument } from "@/features/drawing/document";

/**
 * @name drawingDocumentFor
 * @description Exposes a note editor's ProseMirror document to the drawing
 * overlay. The layer lives in the `drawing` attribute of the document root, so
 * every write is one transaction: one undo step, saved by the editor's ordinary
 * save path.
 *
 * @example
 * <DrawingOverlay getDocument={() => drawingDocumentFor(viewRef.current)} />
 */
export function drawingDocumentFor(view: EditorView | null): DrawingDocument | null {
  if (!view) return null;
  return {
    readPayload: () => view.state.doc.attrs.drawing ?? null,
    replaceLayer: (layer) => view.dispatch(view.state.tr.setDocAttribute("drawing", layer)),
    undo: () => {
      undo(view.state, view.dispatch);
    },
    redo: () => {
      redo(view.state, view.dispatch);
    },
    focus: () => view.dom.focus(),
  };
}
