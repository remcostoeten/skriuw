import type { Node as ProseMirrorNode } from "prosemirror-model";
import { readDiagramModel } from "../diagrams/model";

export function countWords(document: ProseMirrorNode): number {
  let words = 0;
  document.descendants((node) => {
    if (node.type.name === "diagram") {
      for (const item of readDiagramModel(node.attrs.model).nodes) {
        words += item.label.split(/\s+/).filter((word) => word.length > 0).length;
      }
      return false;
    }
    if (node.isText && node.text) {
      words += node.text.split(/\s+/).filter((word) => word.length > 0).length;
    }
    return true;
  });
  return words;
}
