import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLiveSharePublisher } from "@/features/sharing/live-shares";
import { ShareRequestError, type NoteShare } from "@/features/sharing/share-api";
import {
  clearNoteShares,
  forgetNoteShare,
  noteSharesState,
  rememberNoteShare,
} from "@/features/sharing/share-registry";
import { editNote, sharingStore } from "./fixtures";

const DELAY = 1_000;

function share(noteId: string, live: boolean): NoteShare {
  return {
    id: `share-${noteId}`,
    noteId,
    url: `https://skriuw.test/s/share-${noteId}/`,
    live,
    updatedAt: Math.floor(Date.now() / 1_000) + 60,
  };
}

function recordingUpdate() {
  const calls: { shareId: string; title: string; markdown: string }[] = [];
  async function update(shareId: string, content: { title: string; markdown: string }) {
    calls.push({ shareId, ...content });
    const noteId = shareId.replace("share-", "");
    return share(noteId, true);
  }
  return { calls, update };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearNoteShares();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startLiveSharePublisher", () => {
  it("uploads a live note once it has been idle, coalescing a burst of edits", async () => {
    const store = sharingStore();
    const { calls, update } = recordingUpdate();
    const stop = startLiveSharePublisher(store, { delayMs: DELAY, update });
    rememberNoteShare(share("open", true));

    editNote(store, "open", "first");
    await vi.advanceTimersByTimeAsync(DELAY / 2);
    editNote(store, "open", "second");
    await vi.advanceTimersByTimeAsync(DELAY / 2);
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls).toEqual([{ shareId: "share-open", title: "open title", markdown: "second" }]);
    stop();
  });

  it("leaves frozen snapshots alone", async () => {
    const store = sharingStore();
    const { calls, update } = recordingUpdate();
    const stop = startLiveSharePublisher(store, { delayMs: DELAY, update });
    rememberNoteShare(share("open", false));

    editNote(store, "open", "edited");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(calls).toEqual([]);
    stop();
  });

  it("drops a pending upload when sharing stops", async () => {
    const store = sharingStore();
    const { calls, update } = recordingUpdate();
    const stop = startLiveSharePublisher(store, { delayMs: DELAY, update });
    rememberNoteShare(share("open", true));

    editNote(store, "open", "edited");
    forgetNoteShare("open");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(calls).toEqual([]);
    stop();
  });

  it("never publishes a note that was locked after it was shared", async () => {
    const store = sharingStore();
    const { calls, update } = recordingUpdate();
    const stop = startLiveSharePublisher(store, { delayMs: DELAY, update });
    rememberNoteShare(share("locked", true));

    editNote(store, "locked", "secret");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(calls).toEqual([]);
    stop();
  });

  it("forgets a share the server no longer has", async () => {
    const store = sharingStore();
    async function update(): Promise<NoteShare> {
      throw new ShareRequestError("share_not_found", "gone");
    }
    const stop = startLiveSharePublisher(store, { delayMs: DELAY, update });
    rememberNoteShare(share("open", true));

    editNote(store, "open", "edited");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    const state = noteSharesState();
    expect(state.status === "ready" && state.shares.has("open")).toBe(false);
    stop();
  });
});
