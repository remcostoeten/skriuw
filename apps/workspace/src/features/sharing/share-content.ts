import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { extractDrawingFence } from "@/features/drawing/layer";
import { isNodeLocked, isNoteSealed } from "@/features/lock/lock";
import { referenceSafeMarkdown } from "@/features/transfer/markdown";
import { shareableImages } from "./share-images";

export type ShareableNote =
  | { ok: true; title: string; markdown: string; images: WorkspaceImage[] }
  | { ok: false; reason: string };

/**
 * What a public link publishes for one note: its Markdown without the drawing
 * layer, which the public page cannot show, and the images it references
 * that fit the shared image budget. Locked notes never leave the device in
 * plaintext, so they are refused even while unlocked.
 */
export function shareableNote(state: RendererState, noteId: string): ShareableNote {
  const node = state.nodes.get(noteId);
  if (!node || node.kind !== "note") {
    return { ok: false, reason: "This note no longer exists." };
  }
  if (isNodeLocked(state, noteId) || isNoteSealed(state, noteId)) {
    return { ok: false, reason: "Locked notes can't be shared. Remove the lock first." };
  }
  const record = state.documents.get(noteId);
  const markdown = referenceSafeMarkdown(record?.documentJson, record?.markdown ?? "", state.nodes);
  const published = extractDrawingFence(markdown).markdown;
  return {
    ok: true,
    title: node.title,
    markdown: published,
    images: shareableImages(state.images, published),
  };
}
