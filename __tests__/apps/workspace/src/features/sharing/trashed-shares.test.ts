import type { WorkspaceNode, WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareRequestError, type NoteShare } from "@/features/sharing/share-api";
import {
  clearNoteShares,
  noteSharesState,
  rememberNoteShare,
} from "@/features/sharing/share-registry";
import { startTrashedShareRevoker } from "@/features/sharing/trashed-shares";

const RETRY = 1_000;

function node(id: string, kind: WorkspaceNode["kind"], parentId: string | null): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank: 1,
    title: `${id} title`,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    lockedAt: null,
  };
}

function workspace(): RendererStore {
  const snapshot: WorkspaceSnapshot = {
    protocolVersion: 1,
    activeNoteId: "open",
    nodes: [
      node("open", "note", null),
      node("folder", "folder", null),
      node("nested", "note", "folder"),
      node("deep-folder", "folder", "folder"),
      node("deep", "note", "deep-folder"),
    ],
    documents: ["open", "nested", "deep"].map((noteId) => ({
      noteId,
      documentJson: { type: "doc", content: [] },
      markdown: `${noteId} body`,
      revision: 1,
      wordCount: 2,
      sealed: null,
    })),
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "midnight",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "inter",
      editorLineHeight: "comfortable",
      showLineNumbers: true,
      editorPlaceholder: "Start writing...",
    },
  };
  return createRendererStore(createInitialState(snapshot, []));
}

function share(noteId: string): NoteShare {
  return {
    id: `share-${noteId}`,
    noteId,
    url: `https://skriuw.test/s/share-${noteId}/`,
    live: true,
    updatedAt: 1,
  };
}

function sharedNoteIds(): string[] {
  const state = noteSharesState();
  return state.status === "ready" ? [...state.shares.keys()].sort() : [];
}

function trash(store: RendererStore, rootId: string): void {
  store.applyOperations([{ type: "trash_subtree", rootId, at: 100 }]);
}

function restore(store: RendererStore, rootId: string): void {
  store.applyOperations([
    {
      type: "restore_subtree",
      rootId,
      placement: { parentId: null, position: { type: "last" } },
      at: 200,
    },
  ]);
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function recordingRevoke(failures = 0) {
  const calls: string[] = [];
  let remaining = failures;
  async function revoke(shareId: string): Promise<void> {
    calls.push(shareId);
    if (remaining > 0) {
      remaining -= 1;
      throw new ShareRequestError("network", "Skriuw's server could not be reached. Try again.");
    }
  }
  return { calls, revoke };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearNoteShares();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("startTrashedShareRevoker", () => {
  it("stops sharing a note the moment it moves to the trash", async () => {
    const store = workspace();
    const { calls, revoke } = recordingRevoke();
    const stop = startTrashedShareRevoker(store, {
      accountId: "user",
      revoke,
      retryMs: RETRY,
      storage: memoryStorage(),
    });
    rememberNoteShare(share("open"));
    rememberNoteShare(share("nested"));

    trash(store, "open");
    expect(sharedNoteIds()).toEqual(["nested"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["share-open"]);
    stop();
  });

  it("stops sharing every shared note inside a trashed folder", async () => {
    const store = workspace();
    const { calls, revoke } = recordingRevoke();
    const stop = startTrashedShareRevoker(store, {
      accountId: "user",
      revoke,
      retryMs: RETRY,
      storage: memoryStorage(),
    });
    rememberNoteShare(share("open"));
    rememberNoteShare(share("nested"));
    rememberNoteShare(share("deep"));

    trash(store, "folder");
    await vi.advanceTimersByTimeAsync(0);
    expect(sharedNoteIds()).toEqual(["open"]);
    expect(calls.sort()).toEqual(["share-deep", "share-nested"]);
    stop();
  });

  it("revokes shares of notes that were already in the trash when the list loads", async () => {
    const store = workspace();
    trash(store, "open");
    const { calls, revoke } = recordingRevoke();
    const stop = startTrashedShareRevoker(store, {
      accountId: "user",
      revoke,
      retryMs: RETRY,
      storage: memoryStorage(),
    });
    rememberNoteShare(share("open"));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["share-open"]);
    expect(sharedNoteIds()).toEqual([]);
    stop();
  });

  it("leaves shares of notes this device has never seen alone", async () => {
    const store = workspace();
    const { calls, revoke } = recordingRevoke();
    const stop = startTrashedShareRevoker(store, {
      accountId: "user",
      revoke,
      retryMs: RETRY,
      storage: memoryStorage(),
    });
    rememberNoteShare(share("elsewhere"));
    await vi.advanceTimersByTimeAsync(RETRY * 4);
    expect(calls).toEqual([]);
    expect(sharedNoteIds()).toEqual(["elsewhere"]);
    stop();
  });

  it("surfaces a failed revoke once and retries it until the server confirms", async () => {
    const showToast = vi.fn();
    const store = workspace();
    const { calls, revoke } = recordingRevoke(2);
    const storage = memoryStorage();
    const stop = startTrashedShareRevoker(store, {
      accountId: "user",
      revoke,
      retryMs: RETRY,
      storage,
      notify: showToast,
    });
    rememberNoteShare(share("open"));

    trash(store, "open");
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["share-open"]);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0]?.[0].message).toBe('"open title" is still public');
    expect(storage.getItem("skriuw:share-revocations:v1:user")).toContain("share-open");

    await vi.advanceTimersByTimeAsync(RETRY);
    expect(calls).toEqual(["share-open", "share-open"]);
    expect(showToast).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY * 2);
    expect(calls).toEqual(["share-open", "share-open", "share-open"]);
    expect(storage.getItem("skriuw:share-revocations:v1:user")).toBeNull();

    await vi.advanceTimersByTimeAsync(RETRY * 8);
    expect(calls).toHaveLength(3);
    stop();
  });

  it("retries a revoke left pending by an earlier session, even after the note was purged", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "skriuw:share-revocations:v1:user",
      JSON.stringify([{ shareId: "share-gone", noteId: "gone", title: "Gone" }]),
    );
    const { calls, revoke } = recordingRevoke();
    const stop = startTrashedShareRevoker(workspace(), {
      accountId: "user",
      revoke,
      retryMs: RETRY,
      storage,
    });
    rememberNoteShare(share("gone"));
    expect(sharedNoteIds()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["share-gone"]);
    expect(storage.getItem("skriuw:share-revocations:v1:user")).toBeNull();
    stop();
  });

  it("does not publish a restored note again", async () => {
    const store = workspace();
    const { calls, revoke } = recordingRevoke(1);
    const stop = startTrashedShareRevoker(store, {
      accountId: "user",
      revoke,
      notify: vi.fn(),
      retryMs: RETRY,
      storage: memoryStorage(),
    });
    rememberNoteShare(share("open"));

    trash(store, "open");
    await vi.advanceTimersByTimeAsync(0);
    restore(store, "open");
    rememberNoteShare(share("open"));
    expect(sharedNoteIds()).toEqual([]);

    await vi.advanceTimersByTimeAsync(RETRY);
    expect(calls).toEqual(["share-open", "share-open"]);
    expect(sharedNoteIds()).toEqual([]);
    stop();
  });
});
