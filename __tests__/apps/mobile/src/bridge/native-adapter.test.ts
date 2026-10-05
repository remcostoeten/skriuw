import assert from "node:assert/strict";
import { test } from "vitest";
import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import { envelope, type WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { SkriuwCoreError } from "../../../../../apps/mobile/modules/skriuw-core/src/errors";
import { commitOperations } from "@/bridge/commit";
import { createFakeSkriuwCore } from "@/bridge/fake-core";
import { createNativeBridge, type SyncEvent } from "@/bridge/native-adapter";
import { refuseDesktopOnly } from "@/bridge/refusals";

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

  await commit(restarted, bridge, [{ type: "purge_subtree", rootId: "note-1", trashedBefore: 4 }]);
  const snapshot = await bridge.bootstrapWorkspace();
  assert.deepEqual(snapshot.nodes, []);
  assert.deepEqual(snapshot.documents, []);
});

test("a delta read skips a note the core cannot find instead of failing the batch", async () => {
  const bridge = createNativeBridge(createFakeSkriuwCore());
  await bridge.applyWorkspaceOperations([envelope(createNote("note-1", "Draft", "kept"))]);

  const delta = await bridge.readWorkspaceDelta(["note-1", "missing"]);
  assert.deepEqual(
    delta.documents.map((document) => document.noteId),
    ["note-1"],
  );
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
  assert.throws(() => refuseDesktopOnly("Version history"), {
    message: "Version history needs the desktop app.",
  });
  assert.equal((await bridge.noteLockState()).configured, false);
});

test("sync and account routing are answered by the native core, not refused", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);

  assert.deepEqual(await bridge.workspaceSyncStatus(), { state: "localOnly" });
  assert.equal(await bridge.workspaceWakeChannelUrl(), null);
  assert.equal(await bridge.activeWorkspaceSlot(), null);

  assert.equal(await bridge.adoptWorkspaceSlot("workspace-a"), "claimed");
  assert.equal(await bridge.adoptWorkspaceSlot("workspace-a"), "active");
  assert.equal(await bridge.activeWorkspaceSlot(), "workspace-a");
  assert.notDeepEqual(await bridge.connectWorkspaceSync("token", "https://sync.skriuw.app"), {
    state: "localOnly",
  });
  assert.equal(await bridge.workspaceWakeChannelUrl(), "wss://sync.invalid/events");
  assert.deepEqual(await bridge.pauseWorkspaceSync(), { state: "localOnly" });
  assert.deepEqual(await bridge.listBlockedSyncOperations(), {
    viewVersion: 1,
    blocked: [],
    discarded: [],
  });

  assert.equal(await bridge.adoptWorkspaceSlot("workspace-b"), "switched");
  assert.ok(core.calls.includes("connectSync"));
  assert.ok(core.calls.includes("adoptWorkspaceSlot"));
});

test("a durable commit tells the coordinator a push is due", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  await bridge.applyWorkspaceOperations([createNote("note-1", "One")].map(envelope));
  const submitted = core.calls.indexOf("submitOperations");
  assert.ok(submitted >= 0);
  assert.equal(core.calls[submitted + 1], "noteLocalCommit");
});

test("observer events arrive parsed, and a malformed status is dropped", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  const seen: SyncEvent[] = [];
  const unsubscribe = bridge.subscribeSyncEvents((event) => seen.push(event));

  core.emitSync({ kind: "status", payload: '{"state":"upToDate"}' });
  core.emitSync({ kind: "status", payload: "{not json" });
  core.emitSync({
    kind: "workspaceChanged",
    payload: '{"noteIds":["note-1",7],"structureChanged":false,"full":false}',
  });
  core.emitSync({ kind: "sessionExpired", payload: null });
  unsubscribe();
  core.emitSync({ kind: "sessionExpired", payload: null });

  assert.deepEqual(seen, [
    { kind: "status", status: { state: "upToDate" } },
    {
      kind: "workspaceChanged",
      change: { noteIds: ["note-1"], structureChanged: false, full: false },
    },
    { kind: "sessionExpired" },
  ]);
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

test("close waits for commands already past the open", async () => {
  const fake = createFakeSkriuwCore();
  const slow = {
    ...fake,
    async loadDocument(noteId: string) {
      await new Promise((resolve) => setImmediate(resolve));
      return fake.loadDocument(noteId);
    },
  };
  const bridge = createNativeBridge(slow);
  await bridge.applyWorkspaceOperations([envelope(createNote("note-1", "Draft"))]);

  const reading = bridge.readWorkspaceDelta(["note-1"]);
  await bridge.close();

  assert.equal((await reading).documents[0]?.noteId, "note-1");
  assert.ok(fake.calls.lastIndexOf("shutdown") > fake.calls.lastIndexOf("loadDocument"));
});

test("the note lock is answered by the native core, not refused", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  await bridge.applyWorkspaceOperations([envelope(createNote("note-1", "Plans", "launch"))]);

  assert.equal((await bridge.noteLockState()).configured, false);
  const recoveryCode = await bridge.configureNoteLock({ kind: "pin", secret: "2468", hint: null });
  assert.ok(recoveryCode.length > 0);

  await bridge.applyWorkspaceOperations([
    envelope({ type: "set_node_locked", id: "note-1", locked: true, at: 2 }),
  ]);
  assert.equal((await bridge.relockNoteLock()).unlocked, false);
  await assert.rejects(bridge.unlockNoteLock("1111"), hasKind("rejected"));
  assert.equal((await bridge.noteLockState()).failedAttempts, 1);

  assert.equal((await bridge.unlockNoteLock("2468")).unlocked, true);
  const opened = await bridge.readLockedDocuments(["note-1"]);
  assert.deepEqual(
    opened.map((document) => document.noteId),
    ["note-1"],
  );

  const changed = await bridge.changeNoteLockSecret({
    kind: "passphrase",
    secret: "correct horse",
    hint: "a horse",
  });
  assert.equal(changed.kind, "passphrase");
  assert.ok((await bridge.removeNoteLock()).applied >= 1);
  assert.equal((await bridge.noteLockState()).configured, false);
  assert.deepEqual(
    core.calls.filter((call) => call.endsWith("NoteLock") || call === "readLockedDocuments"),
    [
      "configureNoteLock",
      "relockNoteLock",
      "unlockNoteLock",
      "unlockNoteLock",
      "readLockedDocuments",
      "removeNoteLock",
    ],
  );
});

test("lock commands open the slot first and recover with the recovery code", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);

  const recoveryCode = await bridge.configureNoteLock({ kind: "pin", secret: "2468", hint: null });
  assert.deepEqual(core.calls.slice(0, 3), ["protocolVersion", "open", "configureNoteLock"]);
  await bridge.relockNoteLock();

  const recovered = await bridge.recoverNoteLock(recoveryCode, {
    kind: "pin",
    secret: "1357",
    hint: null,
  });
  assert.equal(recovered.unlocked, true);
  await bridge.relockNoteLock();
  assert.equal((await bridge.unlockNoteLock("1357")).unlocked, true);
});
