import assert from "node:assert/strict";
import test from "node:test";
import type { BridgePort } from "../../../../shared/renderer-core/src/bridge/port";
import {
  envelope,
  type WorkspaceOperation,
} from "../../../../shared/renderer-core/src/contracts/workspace";
import {
  createInitialState,
  createRendererStore,
} from "../../../../shared/renderer-core/src/store/store";
import type { RendererStore } from "../../../../shared/renderer-core/src/store/types";
import { SkriuwCoreError } from "../../../modules/skriuw-core/src/errors";
import { commitOperations } from "../commit";
import { createFakeSkriuwCore } from "../fake-core";
import { createNativeBridge } from "../native-adapter";
import { refuseDesktopOnly } from "../refusals";

async function openWorkspace(bridge: BridgePort): Promise<RendererStore> {
  const snapshot = await bridge.bootstrapWorkspace();
  return createRendererStore(
    createInitialState(snapshot, [], {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
}

async function commit(
  store: RendererStore,
  bridge: BridgePort,
  operations: WorkspaceOperation[],
): Promise<void> {
  store.applyOperations(operations);
  store.applyAck(await bridge.applyWorkspaceOperations(operations.map(envelope)));
}

function createNote(id: string, title: string, markdown = ""): WorkspaceOperation {
  return {
    type: "create_note",
    id,
    title,
    placement: { parentId: null, position: { type: "last" } },
    documentJson: { type: "doc", content: [{ type: "paragraph" }] },
    markdown,
    at: 1,
  };
}

function hasKind(kind: string) {
  return (error: unknown) => error instanceof SkriuwCoreError && error.kind === kind;
}

test("create, rename and delete travel through the native adapter", async () => {
  const bridge = createNativeBridge(createFakeSkriuwCore());
  const store = await openWorkspace(bridge);

  await commit(store, bridge, [createNote("note-1", "Untitled")]);
  assert.equal(store.getState().nodes.get("note-1")?.title, "Untitled");
  assert.deepEqual(store.getState().visibleIds, ["note-1"]);

  await commit(store, bridge, [{ type: "rename_node", id: "note-1", title: "Plans", at: 2 }]);
  assert.equal(store.getState().nodes.get("note-1")?.title, "Plans");

  await commit(store, bridge, [{ type: "trash_subtree", rootId: "note-1", at: 3 }]);
  assert.deepEqual(store.getState().visibleIds, []);

  await bridge.close();
  const restarted = await openWorkspace(bridge);
  const durable = restarted.getState().sourceNodes.get("note-1");
  assert.equal(durable?.title, "Plans");
  assert.equal(durable?.deletedAt, 3);
  assert.deepEqual(restarted.getState().visibleIds, []);

  await commit(restarted, bridge, [
    { type: "purge_subtree", rootId: "note-1", trashedBefore: 4 },
  ]);
  const snapshot = await bridge.bootstrapWorkspace();
  assert.deepEqual(snapshot.nodes, []);
  assert.deepEqual(snapshot.documents, []);
});

test("saving a document advances its revision and rejects a stale writer", async () => {
  const bridge = createNativeBridge(createFakeSkriuwCore());
  await bridge.applyWorkspaceOperations([envelope(createNote("note-1", "Draft"))]);
  const save: WorkspaceOperation = {
    type: "save_document",
    noteId: "note-1",
    documentJson: { type: "doc", content: [{ type: "paragraph" }] },
    markdown: "ship the adapter",
    wordCount: 3,
    expectedRevision: 0,
    at: 2,
  };

  const ack = await bridge.applyWorkspaceOperations([envelope(save)]);
  assert.deepEqual(ack.revisions, [{ id: "note-1", revision: 1 }]);

  await assert.rejects(bridge.applyWorkspaceOperations([envelope(save)]), hasKind("conflict"));
  const delta = await bridge.readWorkspaceDelta(["note-1", "missing"]);
  assert.equal(delta.documents.length, 1);
  assert.equal(delta.documents[0]?.revision, 1);
  assert.equal(delta.documents[0]?.markdown, "ship the adapter");
});

test("a rejected batch leaves the workspace untouched", async () => {
  const bridge = createNativeBridge(createFakeSkriuwCore());
  await assert.rejects(
    bridge.applyWorkspaceOperations([
      envelope(createNote("note-1", "Kept out")),
      { protocolVersion: 999, operation: createNote("note-2", "Future") },
    ]),
    hasKind("unsupported-protocol"),
  );
  assert.deepEqual((await bridge.bootstrapWorkspace()).nodes, []);
});

test("a rejected commit rolls the store back and reports the failure", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  const store = await openWorkspace(bridge);
  const failures: unknown[] = [];
  const session = { store, bridge, reportFailure: (error: unknown) => failures.push(error) };

  await commitOperations(session, [createNote("note-1", "Kept")]);
  core.failNextSubmit("busy", "the workspace is busy");
  const rejected = commitOperations(session, [createNote("note-2", "Lost")]);
  assert.equal(store.getState().nodes.has("note-2"), true);

  await assert.rejects(rejected, hasKind("busy"));
  assert.equal(store.getState().nodes.has("note-2"), false);
  assert.equal(store.getState().nodes.get("note-1")?.title, "Kept");
  assert.equal(failures.length, 1);
});

test("navigation makes no native call after startup", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  await bridge.applyWorkspaceOperations(
    [createNote("note-1", "One"), createNote("note-2", "Two")].map(envelope),
  );
  const store = await openWorkspace(bridge);
  const startupCalls = core.calls.length;

  store.setActiveNote("note-1");
  store.setActiveNote("note-2");
  store.selectTreeNode("note-1", "replace");
  store.clearTreeSelection();

  assert.equal(store.getState().activeNoteId, "note-2");
  assert.equal(core.calls.length, startupCalls);
  assert.deepEqual(
    core.calls.filter((call) => call === "open" || call === "protocolVersion"),
    ["protocolVersion", "open"],
  );
});

test("a failed open is retried and a foreign protocol is refused before opening", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  core.failNextOpen("recovery", "the database is not a workspace");
  await assert.rejects(bridge.bootstrapWorkspace(), hasKind("recovery"));
  assert.deepEqual((await bridge.bootstrapWorkspace()).nodes, []);

  const foreign = createFakeSkriuwCore({ protocolVersion: 999 });
  await assert.rejects(
    createNativeBridge(foreign).bootstrapWorkspace(),
    hasKind("unsupported-protocol"),
  );
  assert.equal(foreign.calls.includes("open"), false);
});

test("commands outside the native surface refuse with an actionable message", async () => {
  const bridge = createNativeBridge(createFakeSkriuwCore());
  await assert.rejects(bridge.searchWorkspace("harbour", 10), /^Error: Search needs a newer/);
  await assert.rejects(bridge.storeNoteImage(new Uint8Array([1])), /Storing media needs/);
  await assert.rejects(bridge.connectWorkspaceSync("token", "https://sync.invalid"), /Sync needs/);
  await assert.rejects(bridge.adoptWorkspaceSlot("workspace-a"), /Per-account workspaces needs/);
  assert.throws(() => refuseDesktopOnly("Version history"), {
    message: "Version history needs the desktop app.",
  });
  assert.deepEqual(await bridge.workspaceSyncStatus(), { state: "localOnly" });
  assert.equal((await bridge.noteLockState()).configured, false);
  assert.equal(await bridge.activeWorkspaceSlot(), null);
});

test("a failed rollback still reports the rejection and rethrows it", async () => {
  const core = createFakeSkriuwCore();
  const native = createNativeBridge(core);
  const store = await openWorkspace(native);
  const failures: unknown[] = [];
  const bridge: BridgePort = {
    ...native,
    bootstrapWorkspace: () =>
      Promise.reject(new SkriuwCoreError({ kind: "closed", message: "no workspace is open" })),
  };
  const session = { store, bridge, reportFailure: (error: unknown) => failures.push(error) };

  core.failNextSubmit("workspace", "the database went away");
  await assert.rejects(
    commitOperations(session, [createNote("note-1", "Lost")]),
    hasKind("workspace"),
  );
  assert.equal(failures.length, 2);
  assert.ok(hasKind("workspace")(failures[0]));
  assert.ok(hasKind("closed")(failures[1]));
});

test("a command issued during close reopens after the shutdown settles", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  await bridge.bootstrapWorkspace();

  const closed = bridge.close();
  const reopened = bridge.bootstrapWorkspace();
  await closed;

  assert.deepEqual((await reopened).nodes, []);
  assert.deepEqual(core.calls.slice(-4), ["shutdown", "protocolVersion", "open", "bootstrap"]);
  assert.deepEqual((await bridge.bootstrapWorkspace()).nodes, []);
});

test("close waits for an open in flight so nothing stays open behind it", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);

  const starting = bridge.bootstrapWorkspace();
  await bridge.close();
  await starting.catch(() => undefined);

  assert.ok(core.calls.indexOf("open") !== -1);
  assert.ok(core.calls.lastIndexOf("shutdown") > core.calls.lastIndexOf("open"));
});

test("a throwing reporter neither skips the rollback nor masks the rejection", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  const store = await openWorkspace(bridge);
  const session = {
    store,
    bridge,
    reportFailure: () => {
      throw new Error("reporter broke");
    },
  };

  core.failNextSubmit("busy", "the workspace is busy");
  await assert.rejects(commitOperations(session, [createNote("note-1", "Lost")]), hasKind("busy"));
  assert.equal(store.getState().nodes.has("note-1"), false);
});
