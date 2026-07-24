import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

export function findImageRefPosition(doc: ProseMirrorNode, imageId: string): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "image_ref" && node.attrs.id === imageId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

export function readImageAlt(doc: ProseMirrorNode, imageId: string): string {
  const pos = findImageRefPosition(doc, imageId);
  if (pos === null) return "";
  return String(doc.nodeAt(pos)?.attrs.alt ?? "");
}

export function renameImageNode(view: EditorView, imageId: string, alt: string): void {
  const pos = findImageRefPosition(view.state.doc, imageId);
  if (pos === null) return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, "alt", alt));
}
