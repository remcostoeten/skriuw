import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createRendererStore } from "./store";
import type { RendererState, TreeProjection } from "./types";

function projection(): TreeProjection {
  return {
    metadata: {
      name: "test",
      shape: "mixed",
      noteCount: 3,
      folderCount: 1,
      nodeCount: 4,
      documentCount: 3,
      maxDepth: 2,
      operationCount: 5,
    },
    operationsDigest: "a".repeat(64),
    activeNoteId: "note-child",
    nodes: [
      { id: "folder", parentId: null, kind: "folder", title: "Folder" },
      { id: "note-child", parentId: "folder", kind: "note", title: "Child" },
      { id: "note-root", parentId: null, kind: "note", title: "Root" },
      { id: "note-disabled", parentId: null, kind: "note", title: "Disabled" },
    ],
  };
}

function storeWithDisabledNote() {
  const initial = createInitialState(projection());
  const state: RendererState = { ...initial, disabledIds: new Set(["note-disabled"]) };
  return createRendererStore(state);
}

test("preserves canonical ordering and hidden active selection on collapse", () => {
  const store = storeWithDisabledNote();
  assert.deepEqual(store.getState().nodeOrder, ["folder", "note-child", "note-root", "note-disabled"]);
  assert.equal(store.getState().activeNoteId, "note-child");
  store.toggleExpanded("folder");
  assert.deepEqual(store.getState().visibleIds, ["folder", "note-root", "note-disabled"]);
  assert.equal(store.getState().activeNoteId, "note-child");
  assert.equal(store.getState().focusedNodeId, "folder");
  store.toggleExpanded("folder");
  assert.deepEqual(store.getState().visibleIds, ["folder", "note-child", "note-root", "note-disabled"]);
  assert.equal(store.getState().activeNoteId, "note-child");
});

test("suppresses equivalent updates and selector-equivalent notifications", () => {
  const store = storeWithDisabledNote();
  let notifications = 0;
  const unsubscribe = store.subscribe((state) => state.settingsSelection, () => {
    notifications += 1;
  });
  assert.equal(store.update((state) => state), false);
  assert.equal(store.setActiveNote("note-child"), false);
  assert.equal(store.setMetadataTitle("note-child", "Child"), false);
  store.setActiveNote("note-root");
  assert.equal(notifications, 0);
  assert.equal(store.diagnostics().notifications, 0);
  unsubscribe();
});

test("unsubscribe prevents notification and disabled notes cannot activate", () => {
  const store = storeWithDisabledNote();
  let notifications = 0;
  const unsubscribe = store.subscribe((state) => state.activeNoteId, () => {
    notifications += 1;
  });
  unsubscribe();
  unsubscribe();
  assert.equal(store.setActiveNote("note-disabled"), false);
  assert.equal(store.getState().activeNoteId, "note-child");
  store.setActiveNote("note-root");
  assert.equal(notifications, 0);
  assert.equal(store.diagnostics().listenerCount, 0);
});

test("subscription mutation is deterministic and reentrant updates are FIFO", () => {
  const store = storeWithDisabledNote();
  const calls: string[] = [];
  let removeSecond: () => void = () => undefined;
  store.subscribe((state) => state.activeNoteId, () => {
    calls.push("first");
    removeSecond();
    store.subscribe((state) => state.activeNoteId, () => calls.push("late"));
    if (store.getState().activeNoteId === "note-root") {
      store.setActiveNote("note-child");
    }
  });
  removeSecond = store.subscribe((state) => state.activeNoteId, () => calls.push("second"));
  store.setActiveNote("note-root");
  assert.deepEqual(calls, ["first", "first", "late"]);
  assert.equal(store.getState().activeNoteId, "note-child");
});

test("subscriber failures do not corrupt state or listener bookkeeping", () => {
  const store = storeWithDisabledNote();
  let healthyCalls = 0;
  const removeFailure = store.subscribe((state) => state.activeNoteId, () => {
    throw new Error("subscriber failed");
  });
  store.subscribe((state) => state.activeNoteId, () => {
    healthyCalls += 1;
  });
  assert.throws(() => store.setActiveNote("note-root"), AggregateError);
  assert.equal(store.getState().activeNoteId, "note-root");
  assert.equal(healthyCalls, 1);
  assert.equal(store.diagnostics().listenerFailures, 1);
  assert.equal(store.diagnostics().listenerCount, 2);
  removeFailure();
  store.setActiveNote("note-child");
  assert.equal(healthyCalls, 2);
  assert.equal(store.diagnostics().listenerCount, 1);
});

test("destroy performs complete teardown and rejects later work", () => {
  const store = storeWithDisabledNote();
  store.subscribe((state) => state.activeNoteId, () => undefined);
  store.subscribe((state) => state.settingsSelection, () => undefined);
  assert.equal(store.diagnostics().listenerCount, 2);
  store.destroy();
  assert.equal(store.diagnostics().listenerCount, 0);
  assert.throws(() => store.setActiveNote("note-root"), /destroyed/);
});

test("initial active-note fallback skips disabled documents", () => {
  const nodes = Array.from({ length: 998 }, (_, position) => ({
    id: `note-${position}`,
    parentId: null,
    kind: "note" as const,
    title: `Note ${position}`,
  }));
  const initial = createInitialState({
    ...projection(),
    activeNoteId: "note-997",
    nodes,
    metadata: { ...projection().metadata, noteCount: 998, nodeCount: 998, documentCount: 998 },
  });
  assert.equal(initial.disabledIds.has("note-997"), true);
  assert.equal(initial.activeNoteId, "note-0");
});
