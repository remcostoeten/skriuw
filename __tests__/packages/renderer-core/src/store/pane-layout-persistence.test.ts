import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceSnapshot } from "../../../../../packages/renderer-core/src/contracts/workspace";
import { bindPaneLayoutPersistence } from "../../../../../packages/renderer-core/src/store/pane-layout-persistence";
import {
  PRIMARY_PANE_ID,
  clampSplitRatio,
  flipSplitOrientation,
  openNoteInTab as openNoteInTabPanes,
  parsePaneLayout,
} from "../../../../../packages/renderer-core/src/store/panes";
import {
  createInitialState,
  createRendererStore,
} from "../../../../../packages/renderer-core/src/store/store";
import type { RendererStore } from "../../../../../packages/renderer-core/src/store/types";

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

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

function openNoteInTab(store: RendererStore, noteId: string): void {
  store.update((current) => ({
    ...current,
    panes: openNoteInTabPanes(current.panes, PRIMARY_PANE_ID, noteId),
  }));
  store.setActiveNote(noteId);
}

function setSplitRatio(store: RendererStore, ratio: number): void {
  store.update((current) => ({ ...current, splitRatio: clampSplitRatio(ratio) }));
}

function toggleSplitOrientation(store: RendererStore): void {
  store.update((current) => ({
    ...current,
    splitOrientation: flipSplitOrientation(current.splitOrientation),
  }));
}

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
  assert.deepEqual(parsePaneLayout(writes[0]!)?.panes[0]?.openNoteIds, ["note-a", "note-b"]);
  await binding.dispose();
});

test("committing a divider position persists geometry without touching the tabs", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  const writes: string[] = [];
  const binding = bindPaneLayoutPersistence(
    store,
    async (layoutJson) => {
      writes.push(layoutJson);
    },
    { delayMs: 1 },
  );

  const panesBefore = store.getState().panes;
  setSplitRatio(store, 0.7);
  toggleSplitOrientation(store);
  await settle();

  assert.equal(store.getState().panes, panesBefore);
  const persisted = parsePaneLayout(writes[writes.length - 1] ?? null);
  assert.equal(persisted?.ratio, 0.7);
  assert.equal(persisted?.orientation, "horizontal");
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
    {
      delayMs: 1,
      onError: () => {
        failures += 1;
      },
    },
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
  assert.deepEqual(parsePaneLayout(writes[0]!)?.panes[0]?.openNoteIds, ["note-a", "note-b"]);
});

test("flush remains pending until the durable pane write settles", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  let release: () => void = () => undefined;
  const durable = new Promise<void>((resolve) => {
    release = resolve;
  });
  const binding = bindPaneLayoutPersistence(store, async () => durable, { delayMs: 1_000 });
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

test("importing a workspace snapshot preserves the current pane layout rather than the snapshot", () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  openNoteInTab(store, "note-b");
  const panesBeforeImport = store.getState().panes;

  store.replaceFromSnapshot(snapshot);

  assert.equal(store.getState().panes, panesBeforeImport);
  assert.deepEqual(store.getState().panes[0]?.openNoteIds, ["note-a", "note-b"]);
  assert.equal(store.getState().panes[0]?.paneId, PRIMARY_PANE_ID);
});
