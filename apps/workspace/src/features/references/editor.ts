import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { ReferenceKind } from "@skriuw/renderer-core/references/types";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { EditorExtension } from "@/features/editor/extensions";
import { createLinkedNote } from "@/features/notes/operations";
import { commitReferenceOperations } from "@/store/commit";
import { activateReference } from "./navigation/navigate";
import { createMentionPlugin } from "./prosemirror/mention-plugin";
import { createReferenceNodeViews } from "./prosemirror/node-views";
import { resolveReference } from "./references/resolver";

export { createMentionPlugin } from "./prosemirror/mention-plugin";

function referenceOf(node: ProseMirrorNode): { kind: ReferenceKind; targetId: string } | null {
  const id = typeof node.attrs.id === "string" ? node.attrs.id : null;
  if (!id) {
    return null;
  }
  if (node.type.name === "tag_ref") {
    return { kind: "tag", targetId: id };
  }
  if (node.type.name === "mention_ref") {
    return { kind: node.attrs.kind === "note" ? "note" : "person", targetId: id };
  }
  return null;
}

function activateReferenceNode(store: RendererStore, node: ProseMirrorNode): boolean {
  const reference = referenceOf(node);
  if (!reference) return false;
  const resolved = resolveReference(store.getState(), reference.kind, reference.targetId, "");
  if (resolved.availability !== "resolved") return false;
  activateReference(store, reference.kind, reference.targetId);
  return true;
}

export const referenceEditorExtension: EditorExtension = {
  nodeViews: (store) => createReferenceNodeViews(store),
  plugins: (store) => [
    createMentionPlugin({
      getState: () => store.getState(),
      applyReferenceOperations: (operations) => {
        commitReferenceOperations(store, operations);
      },
      createNote: (id, title) => {
        createLinkedNote(store, id, title);
      },
    }),
  ],
  activateNode: activateReferenceNode,
};
