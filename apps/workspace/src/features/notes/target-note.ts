import type { RendererState } from "@skriuw/renderer-core/store/types";
import { focusedPaneNoteId } from "@/features/notes/navigation";
import { focusedTreeNoteId } from "./focus";
import { sidebarTreeHasFocus } from "@/commands/focus-regions";

/**
 * The note a whole-note action targets, reading focus from the DOM: the
 * sidebar's focused row while the tree owns the keyboard, so acting from the
 * sidebar hits the row under the cursor rather than the note the editor shows.
 */
export function targetNoteId(state: RendererState): string | null {
  if (sidebarTreeHasFocus()) {
    const treeNoteId = focusedTreeNoteId(state);
    if (treeNoteId !== null) {
      return treeNoteId;
    }
  }
  return focusedPaneNoteId(state);
}
