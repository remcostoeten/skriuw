import type { RendererState } from "@skriuw/renderer-core/store/types";
import { checklistItems } from "./checklist-document";

export type PromotionCandidate = {
  /** Position among the note's checklist items; `buildChecklistPromotion` names the item by it. */
  itemIndex: number;
  title: string;
  checked: boolean;
};

export type PromotionSource = {
  noteId: string;
  noteTitle: string;
  candidates: readonly PromotionCandidate[];
};

function untitled(title: string): string {
  return title.trim().length > 0 ? title : "Untitled";
}

/**
 * The checklist items the open note offers for promotion.
 *
 * Only the open note is read. Promotion needs the document, and the workspace
 * holds every document in memory, so offering the whole workspace would put a
 * full-document scan on a store subscription — the cost the desktop surface
 * refuses for the same reason. One note is also what explicit intent means
 * here: the item a person is looking at, not one the surface found for them.
 */
export function projectPromotionSource(state: RendererState): PromotionSource | null {
  const noteId = state.activeNoteId;
  if (noteId === null) {
    return null;
  }
  const record = state.documents.get(noteId);
  if (!record) {
    return null;
  }
  const candidates = checklistItems(record.documentJson)
    .filter((item) => item.taskId === null && item.title.length > 0)
    .map((item) => ({ itemIndex: item.index, title: item.title, checked: item.checked }));
  if (candidates.length === 0) {
    return null;
  }
  return { noteId, noteTitle: untitled(state.nodes.get(noteId)?.title ?? ""), candidates };
}

export function promotionSourcesEqual(
  left: PromotionSource | null,
  right: PromotionSource | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.noteId === right.noteId &&
    left.noteTitle === right.noteTitle &&
    left.candidates.length === right.candidates.length &&
    left.candidates.every((candidate, index) => {
      const other = right.candidates[index];
      return (
        other !== undefined &&
        candidate.itemIndex === other.itemIndex &&
        candidate.title === other.title &&
        candidate.checked === other.checked
      );
    })
  );
}
