import type { DocumentRecord, RendererStore } from "@skriuw/renderer-core/store/types";
import { showToast } from "@/shared/ui/toast";
import { ShareRequestError, updateNoteShare } from "./share-api";
import { shareableNote } from "./share-content";
import {
  forgetNoteShare,
  noteSharesState,
  rememberNoteShare,
  subscribeNoteShares,
} from "./share-registry";

export const LIVE_SHARE_DELAY_MS = 5_000;

type Seen = {
  record: DocumentRecord | undefined;
  title: string | undefined;
};

type Options = {
  delayMs?: number;
  update?: typeof updateNoteShare;
};

/**
 * Keeps live shares current. Edits only record that a note changed; the
 * Markdown is serialized and uploaded once the note has been idle for
 * `delayMs`, so typing never waits on serialization or the network. A note
 * that became locked since it was shared is skipped, never published.
 */
export function startLiveSharePublisher(store: RendererStore, options: Options = {}): () => void {
  const delayMs = options.delayMs ?? LIVE_SHARE_DELAY_MS;
  const update = options.update ?? updateNoteShare;
  const seen = new Map<string, Seen>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failedOnce = new Set<string>();
  const inFlight = new Set<string>();
  const dirty = new Set<string>();

  function liveShare(noteId: string) {
    const shares = noteSharesState();
    const share = shares.status === "ready" ? shares.shares.get(noteId) : undefined;
    return share?.live ? share : undefined;
  }

  function liveNoteIds(): string[] {
    const shares = noteSharesState();
    if (shares.status !== "ready") return [];
    return [...shares.shares.values()].filter((share) => share.live).map((share) => share.noteId);
  }

  function snapshot(noteId: string): Seen {
    const current = store.getState();
    return { record: current.documents.get(noteId), title: current.nodes.get(noteId)?.title };
  }

  function schedule(noteId: string): void {
    clearTimeout(timers.get(noteId));
    timers.set(
      noteId,
      setTimeout(() => {
        timers.delete(noteId);
        void republish(noteId);
      }, delayMs),
    );
  }

  async function republish(noteId: string): Promise<void> {
    if (inFlight.has(noteId)) {
      dirty.add(noteId);
      return;
    }
    const share = liveShare(noteId);
    const note = shareableNote(store.getState(), noteId);
    if (!note.ok || !share) return;
    inFlight.add(noteId);
    try {
      const updated = await update(share.id, { title: note.title, markdown: note.markdown });
      if (liveShare(noteId)?.id === updated.id) rememberNoteShare(updated);
      failedOnce.delete(noteId);
    } catch (error) {
      if (error instanceof ShareRequestError && error.code === "share_not_found") {
        forgetNoteShare(noteId);
        return;
      }
      console.error("live share update failed", error);
      if (failedOnce.has(noteId)) return;
      failedOnce.add(noteId);
      showToast({
        message: `Couldn't update the shared copy of "${note.title || "Untitled"}"`,
        description: error instanceof Error ? error.message : undefined,
        action: { label: "Retry", run: () => schedule(noteId) },
      });
    } finally {
      inFlight.delete(noteId);
      if (dirty.delete(noteId)) void republish(noteId);
    }
  }

  function syncTrackedNotes(): void {
    const shares = noteSharesState();
    const live = new Set(liveNoteIds());
    for (const noteId of seen.keys()) {
      if (live.has(noteId)) continue;
      seen.delete(noteId);
      clearTimeout(timers.get(noteId));
      timers.delete(noteId);
    }
    for (const noteId of live) {
      if (seen.has(noteId)) continue;
      seen.set(noteId, snapshot(noteId));
      const share = shares.status === "ready" ? shares.shares.get(noteId) : undefined;
      const updatedAt = store.getState().metadata.get(noteId)?.updatedAt ?? 0;
      if (share && updatedAt > share.updatedAt * 1_000 + 1_000) schedule(noteId);
    }
  }

  function noticeEdits(): void {
    for (const [noteId, previous] of seen) {
      const current = snapshot(noteId);
      if (current.record === previous.record && current.title === previous.title) continue;
      seen.set(noteId, current);
      schedule(noteId);
    }
  }

  syncTrackedNotes();
  const unsubscribers = [
    subscribeNoteShares(syncTrackedNotes),
    store.subscribe((current) => current.documents, noticeEdits),
    store.subscribe((current) => current.nodes, noticeEdits),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
