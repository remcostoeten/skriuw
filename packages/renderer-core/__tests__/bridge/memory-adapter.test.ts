import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryBridge } from "../../src/bridge/memory-adapter";
import type { BridgePort } from "../../src/bridge/port";
import { envelope, type WorkspaceOperation } from "../../src/contracts/workspace";
import { createInitialState, createRendererStore } from "../../src/store/store";
import type { RendererStore } from "../../src/store/types";

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

test("create, rename and delete travel through the in-memory adapter", async () => {
  const bridge = createMemoryBridge();
  const store = await openWorkspace(bridge);

  await commit(store, bridge, [createNote("note-1", "Untitled")]);
  assert.equal(store.getState().nodes.get("note-1")?.title, "Untitled");
  assert.deepEqual(store.getState().visibleIds, ["note-1"]);

  await commit(store, bridge, [{ type: "rename_node", id: "note-1", title: "Plans", at: 2 }]);
  assert.equal(store.getState().nodes.get("note-1")?.title, "Plans");

  await commit(store, bridge, [{ type: "trash_subtree", rootId: "note-1", at: 3 }]);
  assert.deepEqual(store.getState().visibleIds, []);

  const restarted = await openWorkspace(bridge);
  const durable = restarted.getState().sourceNodes.get("note-1");
  assert.equal(durable?.title, "Plans");
  assert.equal(durable?.deletedAt, 3);
  assert.deepEqual(restarted.getState().visibleIds, []);

  await commit(restarted, bridge, [{ type: "purge_subtree", rootId: "note-1", trashedBefore: 4 }]);
  const snapshot = await bridge.bootstrapWorkspace();
  assert.deepEqual(snapshot.nodes, []);
  assert.deepEqual(snapshot.documents, []);
});

test("saving a document advances its revision and rejects a stale writer", async () => {
  const bridge = createMemoryBridge();
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

  await assert.rejects(bridge.applyWorkspaceOperations([envelope(save)]), /Revision conflict/);
  const delta = await bridge.readWorkspaceDelta(["note-1"]);
  assert.equal(delta.documents[0]?.revision, 1);
  assert.equal(delta.documents[0]?.markdown, "ship the adapter");
});

test("a rejected batch leaves the workspace untouched", async () => {
  const bridge = createMemoryBridge();
  await assert.rejects(
    bridge.applyWorkspaceOperations([
      envelope(createNote("note-1", "Kept out")),
      { protocolVersion: 999, operation: createNote("note-2", "Future") },
    ]),
    /protocol version 999/,
  );
  assert.deepEqual((await bridge.bootstrapWorkspace()).nodes, []);
});

test("search skips trashed notes and honours the note scope", async () => {
  const bridge = createMemoryBridge();
  await bridge.applyWorkspaceOperations(
    [
      createNote("note-1", "Harbour", "ferry times"),
      createNote("note-2", "Groceries", "harbour market list"),
      createNote("note-3", "Harbour old"),
      { type: "trash_subtree", rootId: "note-3", at: 2 } satisfies WorkspaceOperation,
    ].map(envelope),
  );

  const hits = await bridge.searchWorkspace("harbour", 10);
  assert.deepEqual(
    hits.map((hit) => hit.noteId),
    ["note-1", "note-2"],
  );
  const scoped = await bridge.searchWorkspace("harbour", 10, ["note-2"]);
  assert.deepEqual(
    scoped.map((hit) => hit.noteId),
    ["note-2"],
  );
  assert.equal((await bridge.searchIndexStatus()).noteCount, 2);
});

test("the note lock withholds locked documents until it is unlocked", async () => {
  const bridge = createMemoryBridge();
  await bridge.applyWorkspaceOperations([envelope(createNote("note-1", "Private", "secret"))]);
  const recoveryCode = await bridge.configureNoteLock({ kind: "pin", secret: "1234", hint: null });
  await bridge.applyWorkspaceOperations([
    envelope({ type: "set_node_locked", id: "note-1", locked: true, at: 2 }),
  ]);
  assert.equal((await bridge.noteLockState()).lockedNoteCount, 1);
  assert.deepEqual(await bridge.searchWorkspace("secret", 10), []);

  await bridge.relockNoteLock();
  await assert.rejects(bridge.readLockedDocuments(), /Unlock it first/);
  await assert.rejects(bridge.unlockNoteLock("0000"), /does not match/);
  assert.equal((await bridge.noteLockState()).failedAttempts, 1);

  const recovered = await bridge.recoverNoteLock(recoveryCode, {
    kind: "pin",
    secret: "9876",
    hint: null,
  });
  assert.equal(recovered.unlocked, true);
  assert.equal((await bridge.readLockedDocuments())[0]?.noteId, "note-1");

  await bridge.removeNoteLock();
  assert.equal((await bridge.noteLockState()).configured, false);
  assert.equal((await bridge.bootstrapWorkspace()).nodes[0]?.lockedAt ?? null, null);
});

test("media, sync and workspace slots answer without a backend", async () => {
  const bridge = createMemoryBridge();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const stored = await bridge.storeNoteImage(png);
  assert.equal(stored.mimeType, "image/png");
  assert.equal(stored.byteSize, 7);
  assert.deepEqual(
    new Uint8Array(await bridge.readNoteImageBlob(stored.contentHash, stored.mimeType)),
    png,
  );

  assert.deepEqual(await bridge.workspaceSyncStatus(), { state: "localOnly" });
  assert.deepEqual(await bridge.connectWorkspaceSync("token", "https://sync.invalid"), {
    state: "upToDate",
  });
  await bridge.setWorkspaceSyncOnline(false);
  assert.deepEqual(await bridge.workspaceSyncStatus(), { state: "offline" });

  assert.equal(await bridge.adoptWorkspaceSlot("workspace-a"), "claimed");
  assert.equal(await bridge.adoptWorkspaceSlot("workspace-a"), "active");
  assert.equal(await bridge.adoptWorkspaceSlot("workspace-b"), "switched");
  assert.equal(await bridge.activeWorkspaceSlot(), "workspace-b");
});
