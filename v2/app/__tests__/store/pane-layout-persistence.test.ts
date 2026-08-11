import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSnapshot } from "../../src/contracts/workspace";
import { bindPaneLayoutPersistence } from "../../src/store/pane-layout-persistence";
import { PRIMARY_PANE_ID, parsePaneLayout, serializePaneLayout } from "../../src/store/panes";
import { openNoteInTab } from "../../src/store/actions/panes";
import { createInitialState, createRendererStore } from "../../src/store/store";

const snapshot: WorkspaceSnapshot = {
  protocolVersion: 1,
  activeNoteId: "note-a",
  nodes: [
    {
      id: "note-a",
      parentId: null,
      kind: "note",
      rank: 1,
      title: "A",
      icon: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
    {
      id: "note-b",
      parentId: null,
      kind: "note",
      rank: 2,
      title: "B",
      icon: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
  ],
  documents: [],
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
  },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test("pane layout persistence coalesces synchronous updates into the latest write", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  const writes: string[] = [];
  const binding = bindPaneLayoutPersistence(
    store,
    async (layoutJson) => {
      writes.push(layoutJson);
    },
    { delayMs: 1 },
  );

  openNoteInTab(store, "note-b");
  assert.deepEqual(writes, []);
  await settle();
  assert.equal(writes.length, 1);
  assert.deepEqual(parsePaneLayout(writes[0]!)?.[0]?.openNoteIds, ["note-a", "note-b"]);
  await binding.dispose();
});

test("failed pane layout persistence never rolls renderer state back", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  let failures = 0;
  const binding = bindPaneLayoutPersistence(
    store,
    async () => {
      throw new Error("unavailable");
    },
    { delayMs: 1, onError: () => { failures += 1; } },
  );

  openNoteInTab(store, "note-b");
  await settle();
  assert.equal(failures, 1);
  assert.deepEqual(store.getState().panes[0]?.openNoteIds, ["note-a", "note-b"]);
  await assert.rejects(binding.dispose(), /unavailable/);
  assert.equal(failures, 2);
});

test("flush rejects until a failed pane layout is durable", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  let rejectWrites = true;
  const binding = bindPaneLayoutPersistence(
    store,
    async () => {
      if (rejectWrites) throw new Error("unavailable");
    },
    { delayMs: 1 },
  );

  openNoteInTab(store, "note-b");
  await settle();
  await assert.rejects(binding.flush(), /unavailable/);
  rejectWrites = false;
  await binding.flush();
});

test("teardown flushes the latest pane layout before the coalescing delay", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  const writes: string[] = [];
  const binding = bindPaneLayoutPersistence(
    store,
    async (layoutJson) => {
      writes.push(layoutJson);
    },
    { delayMs: 1_000 },
  );

  openNoteInTab(store, "note-b");
  await binding.dispose();

  assert.equal(writes.length, 1);
  assert.deepEqual(parsePaneLayout(writes[0]!)?.[0]?.openNoteIds, ["note-a", "note-b"]);
});

test("flush remains pending until the durable pane write settles", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  let release = () => {};
  const durable = new Promise<void>((resolve) => {
    release = resolve;
  });
  const binding = bindPaneLayoutPersistence(
    store,
    async () => durable,
    { delayMs: 1_000 },
  );
  openNoteInTab(store, "note-b");

  let flushed = false;
  const flush = binding.flush().then(() => {
    flushed = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(flushed, false);
  release();
  await flush;
  assert.equal(flushed, true);
  await binding.dispose();
});

test("pane layout survives a serialize/parse restore round trip", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  openNoteInTab(store, "note-b");
  const persisted = serializePaneLayout(store.getState().panes);

  const restoredPanes = parsePaneLayout(persisted);
  assert.ok(restoredPanes);
  const restoredState = createInitialState(snapshot, []);
  const restoredStore = createRendererStore({ ...restoredState, panes: restoredPanes! });
  assert.deepEqual(restoredStore.getState().panes[0]?.openNoteIds, ["note-a", "note-b"]);
});

test("importing a workspace snapshot preserves the current pane layout rather than the snapshot", () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  openNoteInTab(store, "note-b");
  const panesBeforeImport = store.getState().panes;

  store.replaceFromSnapshot(snapshot);

  assert.equal(store.getState().panes, panesBeforeImport);
  assert.deepEqual(store.getState().panes[0]?.openNoteIds, ["note-a", "note-b"]);
  assert.equal(store.getState().panes[0]?.paneId, PRIMARY_PANE_ID);
});
