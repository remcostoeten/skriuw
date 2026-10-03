import type { Node as ProseMirrorNode } from "prosemirror-model";
import { boundTitle } from "@/features/notes/title";

export function deriveTitle(document: ProseMirrorNode): string {
  return boundTitle(document.firstChild?.textContent ?? "");
}
