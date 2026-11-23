import type { Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { productSchema } from "../schema/product-schema";
import { type ExcalidrawScene, serializeExcalidrawScene } from "./scene";

function nodePosition(doc: ProseMirrorNode, target: ProseMirrorNode): number | null {
  let found: number | null = null;
  doc.descendants((child, pos) => {
    if (found !== null) return false;
    if (child === target) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * @name insertExcalidrawScene
 * @description Inserts a drawing block holding the scene at `position`, or
 * in place of the selection when no position is given, adds a paragraph after
 * it when it would end the note, and selects the new block.
 * @example
 * insertExcalidrawScene(view, scene, drop?.pos ?? null);
 */
export function insertExcalidrawScene(
  view: EditorView,
  scene: ExcalidrawScene,
  position: number | null,
): void {
  const excalidraw = productSchema.nodes.excalidraw;
  const paragraph = productSchema.nodes.paragraph;
  if (!excalidraw || !paragraph) return;
  const node = excalidraw.create({ scene: serializeExcalidrawScene(scene) });
  const { state } = view;
  const transaction =
    position === null
      ? state.tr
      : state.tr.setSelection(TextSelection.near(state.doc.resolve(position)));
  transaction.replaceSelectionWith(node);
  const insertedAt = nodePosition(transaction.doc, node);
  if (insertedAt !== null) {
    const afterNode = insertedAt + node.nodeSize;
    if (!transaction.doc.resolve(afterNode).nodeAfter) {
      transaction.insert(afterNode, paragraph.create());
    }
    transaction.setSelection(NodeSelection.create(transaction.doc, insertedAt));
  }
  view.dispatch(transaction.scrollIntoView());
}
