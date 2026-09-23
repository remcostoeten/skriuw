import assert from "node:assert/strict";
import { test } from "vitest";
import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import { demoSnapshot } from "@/shell/demo-workspace";
import { createNote, renameNode, setNodePinned } from "@/shell/tree-actions";
import {
  TREE_BASE_INDENT,
  TREE_DEPTH_INDENT,
  TREE_MAXIMUM_INDENT,
  idListsEqual,
  treeIndent,
  treeRowAccessibilityHint,
  treeRowAccessibilityLabel,
  treeRowSelector,
  treeRowsEqual,
  visibleIdsSelector,
  type TreeRow,
} from "@/shell/tree-model";
import { openWorkspaceSession, type ShellSession } from "@/shell/workspace-session";

async function openSession(): Promise<ShellSession> {
  return openWorkspaceSession(createMemoryBridge({ snapshot: demoSnapshot() }), (error) => {
    throw error;
  });
}

function requireRow(session: ShellSession, id: string): TreeRow {
  const row = treeRowSelector(id)(session.store.getState());
  assert.ok(row, `no row for ${id}`);
  return row;
}

test("a row reports its own shape and nothing about its siblings", async () => {
  const session = await openSession();
  try {
    const folder = requireRow(session, "folder-field-notes");

    assert.equal(folder.kind, "folder");
    assert.equal(folder.depth, 1);
    assert.equal(folder.childCount, 3);
    assert.equal(folder.expanded, true);
    assert.equal(folder.pinned, false);
    assert.equal(requireRow(session, "note-native-shell").pinned, true);
    assert.equal(treeRowSelector("missing")(session.store.getState()), null);
  } finally {
    await session.close();
  }
});

test("a row only re-renders for changes to its own node", async () => {
  const session = await openSession();
  const notified: string[] = [];
  const unsubscribe = session.store.subscribe(
    treeRowSelector("note-inbox"),
    () => notified.push("note-inbox"),
    treeRowsEqual,
  );

  try {
    await renameNode(session, "note-native-shell", "Renamed sibling");
    await setNodePinned(session, "note-edge-swipe", true);
    assert.deepEqual(notified, []);

    await renameNode(session, "note-inbox", "Capture");
    assert.deepEqual(notified, ["note-inbox"]);
  } finally {
    unsubscribe();
    await session.close();
  }
});

test("collapsing a folder takes its descendants out of the visible rows", async () => {
  const session = await openSession();
  try {
    const before = visibleIdsSelector(session.store.getState());
    assert.ok(before.includes("note-uniffi"));

    session.store.toggleExpanded("folder-field-notes");

    const after = visibleIdsSelector(session.store.getState());
    assert.ok(!after.includes("note-uniffi"));
    assert.ok(!after.includes("note-native-shell"));
    assert.ok(after.includes("folder-field-notes"));
    assert.equal(idListsEqual(before, after), false);
    assert.equal(requireRow(session, "folder-field-notes").expanded, false);
  } finally {
    await session.close();
  }
});

test("a folder's count follows what it holds", async () => {
  const session = await openSession();
  try {
    assert.equal(requireRow(session, "folder-reading").childCount, 1);

    await createNote(session, "folder-reading");

    assert.equal(requireRow(session, "folder-reading").childCount, 2);
  } finally {
    await session.close();
  }
});

test("identical row lists compare equal so an unchanged tree stays quiet", () => {
  assert.equal(idListsEqual(["a", "b"], ["a", "b"]), true);
  assert.equal(idListsEqual(["a", "b"], ["b", "a"]), false);
  assert.equal(idListsEqual(["a"], ["a", "b"]), false);
});

test("indentation grows with depth and stops at the maximum", () => {
  assert.equal(treeIndent(1), TREE_BASE_INDENT);
  assert.equal(treeIndent(2), TREE_BASE_INDENT + TREE_DEPTH_INDENT);
  assert.equal(treeIndent(40), TREE_MAXIMUM_INDENT);
});

test("a screen reader is told what the row is, where it sits, and what it holds", async () => {
  const session = await openSession();
  try {
    assert.equal(
      treeRowAccessibilityLabel(requireRow(session, "folder-field-notes")),
      "Field notes, folder, 3 items, level 1, 1 of 3",
    );
    assert.equal(
      treeRowAccessibilityLabel(requireRow(session, "note-native-shell")),
      "Native shell, note, pinned, level 2, 2 of 3",
    );
    assert.equal(
      treeRowAccessibilityLabel(requireRow(session, "folder-reading")),
      "Reading, folder, 1 item, level 2, 1 of 3",
    );
    assert.match(treeRowAccessibilityHint(requireRow(session, "note-inbox")), /Double tap to open/);
    assert.match(
      treeRowAccessibilityHint(requireRow(session, "folder-reading")),
      /expand or collapse/,
    );
  } finally {
    await session.close();
  }
});
