import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import { bindLockSession } from "@/features/lock/lock-session";
import { isNoteSealed, lockedNodeIds, sealedNoteIds } from "@/features/lock/lock-model";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

function node(
  id: string,
  lockedAt: number | null = null,
  parentId: string | null = null,
): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId,
    rank: 1,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    lockedAt,
  };
}

function document(noteId: string, sealed: boolean): WorkspaceDocument {
  return {
    noteId,
    documentJson: { type: "doc", content: [] },
    markdown: sealed ? "" : `${noteId} body`,
    revision: 2,
    wordCount: sealed ? 0 : 2,
    sealed: sealed
      ? { scheme: "argon2id-xchacha20poly1305-v2", keyId: "k", nonce: "n", ciphertext: "c" }
      : null,
  };
}

function snapshot(settings: Record<string, unknown> = {}): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "locked",
    nodes: [node("locked", 10), node("open")],
    documents: [document("locked", true), document("open", false)],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "midnight",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote: true,
      editorFont: "inter",
      editorLineHeight: "comfortable",
      showLineNumbers: true,
      editorPlaceholder: "Start writing...",
      ...settings,
    },
  };
}

type Listener = () => void;

function fakeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener as Listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(listener as Listener);
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function fakeTimers() {
  const scheduled = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  let now = 0;
  return {
    setTimeout(run: () => void, delay: number) {
      const id = next++;
      scheduled.set(id, { at: now + delay, run });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(id: ReturnType<typeof setTimeout>) {
      scheduled.delete(id as unknown as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, entry] of Array.from(scheduled)) {
        if (entry.at <= now) {
          scheduled.delete(id);
          entry.run();
        }
      }
    },
    pending() {
      return scheduled.size;
    },
  } as unknown as Pick<typeof globalThis, "setTimeout" | "clearTimeout"> & {
    advance(ms: number): void;
    pending(): number;
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function unlockedStore(store: RendererStore): void {
  store.setNoteLock({
    configured: true,
    unlocked: true,
    kind: "pin",
    hint: null,
    failedAttempts: 0,
    nextAttemptAt: null,
    lockedNoteCount: 1,
  });
}

test("sealed bodies are fetched once the session unlocks and again after a placeholder returns", async () => {
  const store = createRendererStore(createInitialState(snapshot(), []));
  const hydrations: string[][] = [];
  const unbind = bindLockSession(store, {
    window: fakeTarget(),
    document: fakeTarget(),
    timers: fakeTimers(),
    refresh: async () => undefined,
    relock: async () => undefined,
    hydrate: async (target) => {
      const ids = sealedNoteIds(target.getState());
      hydrations.push(ids);
      target.applyRemoteDocuments({ documents: ids.map((id) => document(id, false)), nodes: [] });
    },
    onError: (context, error) => assert.fail(`${context}: ${String(error)}`),
  });
  assert.deepEqual(hydrations, [], "a locked session never asks for bodies");
  assert.equal(isNoteSealed(store.getState(), "locked"), true);

  unlockedStore(store);
  await flush();
  assert.deepEqual(hydrations, [["locked"]]);
  assert.equal(isNoteSealed(store.getState(), "locked"), false);
  assert.equal(store.getState().documents.get("locked")?.markdown, "locked body");

  store.applyRemoteDocuments({
    documents: [{ ...document("locked", true), revision: 3 }],
    nodes: [],
  });
  await flush();
  assert.deepEqual(
    hydrations,
    [["locked"], ["locked"]],
    "a sync delta re-sealing a note is opened again",
  );
  unbind();
});

test("the idle timer relocks after the configured minutes and activity resets it", async () => {
  const store = createRendererStore(createInitialState(snapshot({ autoLockMinutes: 1 }), []));
  const documentTarget = fakeTarget();
  const timers = fakeTimers();
  let relocks = 0;
  const unbind = bindLockSession(store, {
    window: fakeTarget(),
    document: documentTarget,
    timers,
    refresh: async () => undefined,
    hydrate: async () => undefined,
    relock: async () => {
      relocks += 1;
    },
    onError: (context, error) => assert.fail(`${context}: ${String(error)}`),
  });
  assert.equal(timers.pending(), 0, "nothing is armed while the session is locked");
  unlockedStore(store);
  assert.equal(timers.pending(), 1);
  timers.advance(30_000);
  documentTarget.fire("keydown");
  timers.advance(40_000);
  assert.equal(relocks, 0, "activity pushed the deadline out");
  timers.advance(30_000);
  await flush();
  assert.equal(relocks, 1);
  unbind();
  assert.equal(documentTarget.count("keydown"), 0);
});

test("blur relocks only when the setting asks for it", async () => {
  const store = createRendererStore(createInitialState(snapshot({ autoLockMinutes: 0 }), []));
  const windowTarget = fakeTarget();
  let relocks = 0;
  const unbind = bindLockSession(store, {
    window: windowTarget,
    document: fakeTarget(),
    timers: fakeTimers(),
    refresh: async () => undefined,
    hydrate: async () => undefined,
    relock: async () => {
      relocks += 1;
    },
    onError: (context, error) => assert.fail(`${context}: ${String(error)}`),
  });
  unlockedStore(store);
  windowTarget.fire("blur");
  assert.equal(relocks, 0);
  store.applyOperations([
    { type: "update_settings", settings: { ...store.getState().settings, lockOnBlur: true } },
  ]);
  windowTarget.fire("blur");
  await flush();
  assert.equal(relocks, 1);
  unbind();
  assert.deepEqual(lockedNodeIds(store.getState()), ["locked"]);
});
