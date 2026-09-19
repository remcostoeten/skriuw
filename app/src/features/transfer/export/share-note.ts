import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { referenceSafeMarkdown } from "./markdown-transfer-model";

/** True where the platform offers a native share sheet, which today means phones. */
export function canShareNotes(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Hands the note's Markdown to the operating system share sheet. A dismissed
 * sheet rejects with AbortError and is not a failure; anything else is.
 */
export async function shareNoteAsText(store: RendererStore, noteId: string): Promise<boolean> {
  const state = store.getState();
  const node = state.nodes.get(noteId);
  if (!node || !canShareNotes()) {
    return false;
  }
  const record = state.documents.get(noteId);
  if ((record?.sealed ?? null) !== null) {
    throw new Error("Unlock the note before sharing it.");
  }
  const text = referenceSafeMarkdown(record?.documentJson, record?.markdown ?? "", state.nodes);
  try {
    await navigator.share({ title: node.title, text });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }
    throw error;
  }
}
