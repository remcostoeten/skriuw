import { flushPendingWork } from "@/store/pending-work";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { commitOperations, isRevisionConflict } from "@/store/commit";
import { buildRestoreOperation } from "./restore";

export async function restoreNoteVersion(
  store: RendererStore,
  noteId: string,
  versionMarkdown: string,
): Promise<void> {
  await flushPendingWork();
  const record = store.getState().documents.get(noteId);
  if (!record) {
    return;
  }
  function restoreAt(expectedRevision: number): Promise<void> {
    return commitOperations(store, [
      buildRestoreOperation({
        noteId,
        versionMarkdown,
        expectedRevision,
        at: Date.now(),
      }),
    ]);
  }
  try {
    await restoreAt(record.revision);
  } catch (error) {
    // A save landing between the flush and the commit fails the revision
    // check; the rejected commit re-bootstrapped the store, so one retry at
    // the fresh revision restores over it. The overtaken content stays
    // recoverable in version history.
    const fresh = store.getState().documents.get(noteId);
    if (!isRevisionConflict(error) || !fresh || fresh.revision === record.revision) {
      throw error;
    }
    await restoreAt(fresh.revision);
  }
}
