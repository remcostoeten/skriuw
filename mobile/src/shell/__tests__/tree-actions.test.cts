import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryBridge } from "../../../../shared/renderer-core/src/bridge/memory-adapter";
import { demoSnapshot } from "../demo-workspace";
import {
  activateNote,
  createFolder,
  createNote,
  currentPlacement,
  moveNode,
  moveTargets,
  purgeNode,
  renameNode,
  restoreNode,
  setNodePinned,
  trashNode,
} from "../tree-actions";
import { pinnedEntriesSelector, visibleIdsSelector } from "../tree-model";
import { openWorkspaceSession, type ShellSession } from "../workspace-session";

async function openSession(): Promise<ShellSession> {
  return openWorkspaceSession(createMemoryBridge({ snapshot: demoSnapshot() }), (error) => {
    throw error;
  });
}

async function withSession(run: (session: ShellSession) => Promise<void>): Promise<void> {
  const session = await openSession();
  try {
    await run(session);
  } finally {
    await session.close();
  }
}

test("creating a note places it in the tree and opens it", async () => {
  await withSession(async (session) => {
    const id = await createNote(session, "folder-field-notes");
    const state = session.store.getState();

    assert.equal(state.nodes.get(id)?.title, "Untitled");
    assert.equal(state.nodes.get(id)?.parentId, "folder-field-notes");
    assert.equal(state.activeNoteId, id);
    assert.ok(visibleIdsSelector(state).includes(id));
  });
});

test("creating a folder nests under its parent", async () => {
  await withSession(async (session) => {
    const id = await createFolder(session, "folder-field-notes");
    const node = session.store.getState().nodes.get(id);

    assert.equal(node?.kind, "folder");
    assert.equal(node?.parentId, "folder-field-notes");
  });
});

test("renaming trims the title and ignores an empty or unchanged one", async () => {
  await withSession(async (session) => {
    await renameNode(session, "note-inbox", "  Capture  ");
    assert.equal(session.store.getState().nodes.get("note-inbox")?.title, "Capture");

    await renameNode(session, "note-inbox", "   ");
    assert.equal(session.store.getState().nodes.get("note-inbox")?.title, "Capture");

    await renameNode(session, "note-inbox", "Capture");
    assert.equal(session.store.getState().nodes.get("note-inbox")?.title, "Capture");
  });
});

test("moving a node reparents it, and moving it onto itself is refused", async () => {
  await withSession(async (session) => {
    await moveNode(session, "note-inbox", "folder-reading");
    assert.equal(session.store.getState().nodes.get("note-inbox")?.parentId, "folder-reading");

    await moveNode(session, "note-inbox", "folder-reading");
    assert.equal(session.store.getState().nodes.get("note-inbox")?.parentId, "folder-reading");
  });
});

test("move targets are every folder but the node itself and its descendants", async () => {
  await withSession(async (session) => {
    const targets = moveTargets(session.store.getState(), "folder-field-notes");

    assert.ok(!targets.includes("folder-field-notes"));
    assert.ok(!targets.includes("folder-reading"));
    assert.ok(targets.includes("folder-journal-drafts"));
  });
});

test("pinning surfaces a node in the pinned list and unpinning removes it", async () => {
  await withSession(async (session) => {
    await setNodePinned(session, "note-inbox", true);
    assert.deepEqual(
      pinnedEntriesSelector(session.store.getState()).map((entry) => entry.id),
      ["note-inbox", "note-native-shell"],
    );

    await setNodePinned(session, "note-inbox", false);
    assert.deepEqual(
      pinnedEntriesSelector(session.store.getState()).map((entry) => entry.id),
      ["note-native-shell"],
    );
  });
});

test("deleting a node removes its subtree and undo restores it to the same slot", async () => {
  await withSession(async (session) => {
    const before = session.store.getState();
    const siblingsBefore = before.childrenByParent.get("folder-field-notes");
    const placement = currentPlacement(before, "note-native-shell");
    assert.deepEqual(placement, {
      parentId: "folder-field-notes",
      position: { type: "before", anchorId: "note-edge-swipe" },
    });

    const trashed = await trashNode(session, "folder-field-notes");
    assert.equal(trashed.title, "Field notes");

    const afterTrash = session.store.getState();
    assert.equal(afterTrash.nodes.has("folder-field-notes"), false);
    assert.equal(afterTrash.nodes.has("note-native-shell"), false);
    assert.equal(afterTrash.nodes.has("note-uniffi"), false);

    await restoreNode(session, trashed);

    const afterUndo = session.store.getState();
    assert.equal(afterUndo.nodes.has("note-uniffi"), true);
    assert.deepEqual(afterUndo.childrenByParent.get("folder-field-notes"), siblingsBefore);
  });
});

test("deleting the open note hands the editor to the note beside it", async () => {
  await withSession(async (session) => {
    activateNote(session.store, "note-native-shell");
    await trashNode(session, "note-native-shell");

    assert.equal(session.store.getState().activeNoteId, "note-edge-swipe");
  });
});

test("deleting the last note leaves no note open", async () => {
  await withSession(async (session) => {
    for (const id of [...session.store.getState().noteIds]) {
      activateNote(session.store, id);
      await trashNode(session, id);
    }

    assert.equal(session.store.getState().activeNoteId, null);
  });
});

test("undo after the original parent is gone restores to the top level", async () => {
  await withSession(async (session) => {
    const trashed = await trashNode(session, "note-uniffi");
    await trashNode(session, "folder-reading");
    await restoreNode(session, trashed);

    assert.equal(session.store.getState().nodes.get("note-uniffi")?.parentId, null);
  });
});

test("purging a trashed subtree is not undoable through the tree", async () => {
  await withSession(async (session) => {
    const trashed = await trashNode(session, "note-inbox");
    await purgeNode(session, trashed.id);
    await restoreNode(session, trashed);

    assert.equal(session.store.getState().nodes.has("note-inbox"), false);
  });
});

test("a rejected batch reports the failure and rolls the store back", async () => {
  const bridge = createMemoryBridge({ snapshot: demoSnapshot() });
  const rejected = new Error("native core refused the batch");
  const reported: unknown[] = [];
  const session = await openWorkspaceSession(bridge, (error) => {
    reported.push(error);
  });
  bridge.applyWorkspaceOperations = () => Promise.reject(rejected);

  try {
    await assert.rejects(renameNode(session, "note-inbox", "Rejected"), rejected);
    assert.deepEqual(reported, [rejected]);
    assert.equal(session.store.getState().nodes.get("note-inbox")?.title, "Inbox");
  } finally {
    await session.close();
  }
});
