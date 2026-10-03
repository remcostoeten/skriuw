import { flushPendingWork } from "@/store/pending-work";
import {
  SECONDARY_PANE_ID,
  openBeside as openBesidePanes,
  secondaryPane,
} from "@skriuw/renderer-core/store/panes";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { commitOperations } from "@/store/commit";
import { planNoteDuplicate } from "./duplicate";
import { activateNote, focusedPaneNoteId, nextNoteAfterRemoval } from "./navigation";
import { restoreSubtree, trashSubtree } from "./operations";

export type TrashedNote = { noteId: string; title: string };

/**
 * Soft-deletes the open note down the sidebar's trash path, after flushing
 * pending edits so the trashed revision matches what was on screen. Returns what
 * was trashed so callers can offer an undo.
 */
export async function trashCurrentNote(store: RendererStore): Promise<TrashedNote | null> {
  const noteId = focusedPaneNoteId(store.getState());
  if (noteId === null) {
    return null;
  }
  await flushPendingWork();
  const state = store.getState();
  if (state.nodes.get(noteId)?.kind !== "note") {
    return null;
  }
  const title = state.nodes.get(noteId)?.title ?? "Untitled";
  const nextNoteId = nextNoteAfterRemoval(state, noteId);
  trashSubtree(store, noteId);
  activateNote(store, nextNoteId);
  return { noteId, title };
}

/** Undoes `trashCurrentNote`: restores the subtree and reopens the note. */
export function restoreTrashedNote(store: RendererStore, noteId: string): void {
  restoreSubtree(store, noteId);
  activateNote(store, noteId);
}

export type DuplicatedNote = { noteId: string; title: string };

/**
 * Opens `noteId` in whichever pane has focus. Creating a note always makes it
 * the workspace's active note, which is the primary pane — so when the split
 * pane has focus the primary pane is handed `restoreActiveNoteId` back and the
 * new note goes to the split instead.
 */
function openInFocusedPane(
  store: RendererStore,
  noteId: string,
  restoreActiveNoteId: string | null,
): void {
  const state = store.getState();
  if (state.focusedPaneId !== SECONDARY_PANE_ID || secondaryPane(state.panes) === null) {
    activateNote(store, noteId);
    return;
  }
  activateNote(store, restoreActiveNoteId);
  store.update((current) => ({
    ...current,
    panes: openBesidePanes(current.panes, noteId),
    focusedNodeId: noteId,
  }));
}

/**
 * Duplicates the open note into the slot right after it, after flushing pending
 * edits so the copy matches what was on screen. Content, properties, and
 * reference chips come across; note, block, and property identities are fresh,
 * the copy is never pinned, and its created-at is now. The copy opens in the
 * pane the original was open in.
 *
 * `targetNoteId` duplicates a note other than the open one — the sidebar's
 * focused row, when the tree owns the keyboard — and falls back to the note in
 * the focused pane.
 */
export async function duplicateCurrentNote(
  store: RendererStore,
  targetNoteId?: string | null,
): Promise<DuplicatedNote | null> {
  const noteId = targetNoteId ?? focusedPaneNoteId(store.getState());
  if (noteId === null || store.getState().nodes.get(noteId)?.kind !== "note") {
    return null;
  }
  await flushPendingWork();
  const state = store.getState();
  const previousActiveNoteId = state.activeNoteId;
  const plan = planNoteDuplicate(state, noteId, Date.now(), () => crypto.randomUUID());
  if (plan === null) {
    return null;
  }
  try {
    await commitOperations(store, [...plan.operations]);
  } catch (error) {
    reportRejection("duplicate note")(error);
    return null;
  }
  openInFocusedPane(store, plan.noteId, previousActiveNoteId);
  return { noteId: plan.noteId, title: plan.title };
}

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}
