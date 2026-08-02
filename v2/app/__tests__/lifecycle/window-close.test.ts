import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import { bindWindowClosePersistence } from "../../src/lifecycle/window-close";
import { createInitialState, createRendererStore } from "../../src/store/store";

type CloseEvent = {
  prevented: boolean;
  preventDefault: () => void;
};

function note(id: string, rank: number): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

function snapshot(rememberLastNote = true): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    nodes: [note("note-1", 1), note("note-2", 2)],
    documents: [
      {
        noteId: "note-1",
        documentJson: { type: "doc" },
        markdown: "",
        revision: 0,
        wordCount: 0,
      },
      {
        noteId: "note-2",
        documentJson: { type: "doc" },
        markdown: "",
        revision: 0,
        wordCount: 0,
      },
    ],
    settings: {
      settingsVersion: 1,
      theme: "midnight",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote,
      editorFont: "inter",
      editorLineHeight: "comfortable",
      showLineNumbers: true,
      editorPlaceholder: "Start writing...",
    },
    activeNoteId: "note-1",
    historyHeaders: [],
  };
}

function closeEvent(): CloseEvent {
  const event: CloseEvent = {
    prevented: false,
    preventDefault: () => {
      event.prevented = true;
    },
  };
  return event;
}

function fakeWindow(failedCloseAttempts = 0) {
  let handler: ((event: CloseEvent) => void | Promise<void>) | null = null;
  let closeCalls = 0;
  let unlistenCalls = 0;
  return {
    port: {
      onCloseRequested: async (
        next: (event: CloseEvent) => void | Promise<void>,
      ) => {
        handler = next;
        return () => {
          unlistenCalls += 1;
          handler = null;
        };
      },
      completeClose: async () => {
        closeCalls += 1;
        if (closeCalls <= failedCloseAttempts) {
          throw new Error("close failed");
        }
      },
    },
    request: async () => {
      const event = closeEvent();
      await handler?.(event);
      return event;
    },
    closeCalls: () => closeCalls,
    unlistenCalls: () => unlistenCalls,
  };
}

test("selection remains local and one close request persists the latest active note", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  const operations: unknown[] = [];
  const cleanup = await bindWindowClosePersistence(
    store,
    async (submitted) => {
      operations.push(submitted);
    },
    window.port,
  );

  store.setActiveNote("note-2");
  store.setActiveNote("note-1");
  store.setActiveNote("note-2");
  assert.equal(operations.length, 0);

  const event = await window.request();
  assert.equal(event.prevented, true);
  assert.deepEqual(operations, [
    [
      {
        protocolVersion: 1,
        operation: { type: "set_active_note", noteId: "note-2" },
      },
    ],
  ]);
  assert.equal(window.closeCalls(), 1);
  cleanup();
  cleanup();
  assert.equal(window.unlistenCalls(), 1);
});

test("disabled continuity closes without persisting active-note state", async () => {
  const store = createRendererStore(createInitialState(snapshot(false)));
  const window = fakeWindow();
  let persistenceCalls = 0;
  await bindWindowClosePersistence(
    store,
    async () => {
      persistenceCalls += 1;
    },
    window.port,
  );

  await window.request();
  assert.equal(persistenceCalls, 0);
  assert.equal(window.closeCalls(), 1);
});

test("overlapping close requests stay intercepted behind one persistence", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  let finishPersistence: (() => void) | null = null;
  let persistenceCalls = 0;
  await bindWindowClosePersistence(
    store,
    () =>
      new Promise<void>((resolve) => {
        persistenceCalls += 1;
        finishPersistence = resolve;
      }),
    window.port,
  );

  const firstRequest = window.request();
  await Promise.resolve();
  const secondEvent = await window.request();
  assert.equal(secondEvent.prevented, true);
  assert.equal(persistenceCalls, 1);
  assert.equal(window.closeCalls(), 0);
  assert.ok(finishPersistence);
  finishPersistence();
  await firstRequest;
  assert.equal(window.closeCalls(), 1);
});

test("persistence rejection is reported and keeps the window open for retry", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  const failures: unknown[] = [];
  await bindWindowClosePersistence(
    store,
    async () => {
      throw new Error("durable rejection");
    },
    window.port,
    { onError: (error) => failures.push(error) },
  );

  await window.request();
  assert.equal(failures.length, 1);
  assert.match(String(failures[0]), /durable rejection/);
  assert.equal(window.closeCalls(), 0);
});

test("bounded wait reports a timeout while the accepted persistence may finish", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  const failures: unknown[] = [];
  let finishPersistence: (() => void) | null = null;
  let completed = false;
  await bindWindowClosePersistence(
    store,
    () =>
      new Promise<void>((resolve) => {
        finishPersistence = () => {
          completed = true;
          resolve();
        };
      }),
    window.port,
    { timeoutMs: 1, onError: (error) => failures.push(error) },
  );

  await window.request();
  assert.equal(window.closeCalls(), 0);
  assert.match(String(failures[0]), /timed out/);
  assert.equal(completed, false);
  assert.ok(finishPersistence);
  finishPersistence();
  await Promise.resolve();
  assert.equal(completed, true);
});

test("a later close retries pending work after persistence failure", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  let attempts = 0;
  await bindWindowClosePersistence(
    store,
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
    },
    window.port,
  );

  await window.request();
  assert.equal(window.closeCalls(), 0);
  await window.request();
  assert.equal(attempts, 2);
  assert.equal(window.closeCalls(), 1);
});

test("listener registration failure degrades without failing initialization", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const failures: unknown[] = [];
  const cleanup = await bindWindowClosePersistence(
    store,
    async () => {},
    {
      onCloseRequested: async () => {
        throw new Error("listener unavailable");
      },
      completeClose: async () => {},
    },
    { onError: (error) => failures.push(error) },
  );

  assert.equal(failures.length, 1);
  assert.match(String(failures[0]), /listener unavailable/);
  cleanup();
  cleanup();
});

test("failed close completion permits a later request to retry", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow(1);
  const failures: unknown[] = [];
  let persistenceCalls = 0;
  await bindWindowClosePersistence(
    store,
    async () => {
      persistenceCalls += 1;
    },
    window.port,
    { onError: (error) => failures.push(error) },
  );

  await window.request();
  assert.equal(persistenceCalls, 1);
  assert.equal(window.closeCalls(), 1);
  assert.match(String(failures[0]), /close failed/);

  await window.request();
  assert.equal(persistenceCalls, 2);
  assert.equal(window.closeCalls(), 2);
});

test("null active-note state is persisted at close", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  const operations: unknown[] = [];
  await bindWindowClosePersistence(
    store,
    async (submitted) => {
      operations.push(submitted);
    },
    window.port,
  );

  store.setActiveNote(null);
  await window.request();
  assert.deepEqual(operations, [
    [
      {
        protocolVersion: 1,
        operation: { type: "set_active_note", noteId: null },
      },
    ],
  ]);
});

test("cleanup removes the close listener and leaves later close requests unintercepted", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  let persistenceCalls = 0;
  const cleanup = await bindWindowClosePersistence(
    store,
    async () => {
      persistenceCalls += 1;
    },
    window.port,
  );

  cleanup();
  const event = await window.request();
  assert.equal(event.prevented, false);
  assert.equal(persistenceCalls, 0);
  assert.equal(window.closeCalls(), 0);
  assert.equal(window.unlistenCalls(), 1);
});

test("persisted close selection remains the next bootstrap selection", async () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const window = fakeWindow();
  const restarted = snapshot();
  await bindWindowClosePersistence(
    store,
    async ([submitted]) => {
      if (submitted?.operation.type === "set_active_note") {
        restarted.activeNoteId = submitted.operation.noteId;
      }
    },
    window.port,
  );

  store.setActiveNote("note-2");
  await window.request();
  const nextState = createInitialState(restarted);
  assert.equal(nextState.activeNoteId, "note-2");
  assert.equal(nextState.focusedNodeId, "note-2");
});
