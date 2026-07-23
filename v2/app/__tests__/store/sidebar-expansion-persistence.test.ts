import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSnapshot } from "../../src/contracts/workspace";
import { bindSidebarExpansionPersistence } from "../../src/store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "../../src/store/store";

const snapshot: WorkspaceSnapshot = {
  protocolVersion: 1,
  activeNoteId: null,
  nodes: [
    {
      id: "folder-a",
      parentId: null,
      kind: "folder",
      rank: 1,
      title: "A",
      icon: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
    {
      id: "folder-b",
      parentId: null,
      kind: "folder",
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

test("expansion persistence coalesces synchronous paints into the latest write", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  const writes: string[][] = [];
  const unbind = bindSidebarExpansionPersistence(
    store,
    async (folderIds) => {
      writes.push([...folderIds]);
    },
    { delayMs: 1 },
  );

  store.toggleExpanded("folder-a");
  store.toggleExpanded("folder-b");
  store.toggleExpanded("folder-a");
  assert.deepEqual([...store.getState().expandedIds], ["folder-b"]);
  assert.deepEqual(writes, []);
  await settle();
  assert.deepEqual(writes, [["folder-b"]]);
  unbind();
});

test("failed expansion persistence never rolls renderer state back", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  let failures = 0;
  const unbind = bindSidebarExpansionPersistence(
    store,
    async () => {
      throw new Error("unavailable");
    },
    { delayMs: 1, onError: () => { failures += 1; } },
  );

  store.toggleExpanded("folder-a");
  await settle();
  assert.equal(failures, 1);
  assert.deepEqual([...store.getState().expandedIds], ["folder-a"]);
  unbind();
});

test("teardown flushes the latest expansion before the coalescing delay", async () => {
  const store = createRendererStore(createInitialState(snapshot, []));
  const writes: string[][] = [];
  const unbind = bindSidebarExpansionPersistence(
    store,
    async (folderIds) => {
      writes.push([...folderIds]);
    },
    { delayMs: 1_000 },
  );

  store.toggleExpanded("folder-a");
  store.toggleExpanded("folder-b");
  unbind();
  await settle();

  assert.deepEqual(writes, [["folder-a", "folder-b"]]);
});
