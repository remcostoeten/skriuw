import assert from "node:assert/strict";
import { test } from "vitest";
import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import { dropMoves } from "@skriuw/renderer-core/store/tree-drop";
import { demoSnapshot } from "@/shell/demo-workspace";
import { TREE_ROW_HEIGHT } from "@/shell/metrics";
import {
  createFolder,
  createNote,
  currentPlacement,
  moveNode,
  placeNode,
  restoreNodePlacement,
} from "@/shell/tree-actions";
import {
  dropTargetAtOffset,
  EDGE_SCROLL_STEP_PX,
  edgeScrollStep,
  hoverBand,
  hoverExpands,
} from "@/shell/tree-drag";
import { openWorkspaceSession, type ShellSession } from "@/shell/workspace-session";

async function withSession(run: (session: ShellSession) => Promise<void>): Promise<void> {
  const session = await openWorkspaceSession(
    createMemoryBridge({ snapshot: demoSnapshot() }),
    (error) => {
      throw error;
    },
  );
  try {
    await run(session);
  } finally {
    await session.close();
  }
}

function indexOf(session: ShellSession, id: string): number {
  const index = session.store.getState().visibleIds.indexOf(id);
  assert.ok(index >= 0, `${id} is not visible`);
  return index;
}

async function expand(session: ShellSession, id: string): Promise<void> {
  if (!session.store.getState().expandedIds.has(id)) {
    session.store.toggleExpanded(id);
  }
}

function offsetIn(session: ShellSession, id: string, fraction: number): number {
  return (indexOf(session, id) + fraction) * TREE_ROW_HEIGHT;
}

test("the middle of a folder row takes the dragged node in", async () => {
  await withSession(async (session) => {
    const folder = await createFolder(session, null);
    const note = await createNote(session, null);
    const state = session.store.getState();

    assert.deepEqual(dropTargetAtOffset(state, note, offsetIn(session, folder, 0.5)), {
      kind: "row",
      id: folder,
      zone: "inside",
    });
    assert.equal(
      dropTargetAtOffset(state, note, offsetIn(session, folder, 0.1))?.kind === "row" &&
        dropTargetAtOffset(state, note, offsetIn(session, folder, 0.9)) !== null,
      true,
    );
  });
});

test("a note row splits into before and after", async () => {
  await withSession(async (session) => {
    const first = await createNote(session, null);
    const second = await createNote(session, null);
    const state = session.store.getState();

    assert.deepEqual(dropTargetAtOffset(state, second, offsetIn(session, first, 0.2)), {
      kind: "row",
      id: first,
      zone: "before",
    });
    assert.deepEqual(dropTargetAtOffset(state, second, offsetIn(session, first, 0.8)), {
      kind: "row",
      id: first,
      zone: "after",
    });
  });
});

test("below the last row is the top level, above the list is nothing", async () => {
  await withSession(async (session) => {
    const note = await createNote(session, null);
    const state = session.store.getState();
    const below = (state.visibleIds.length + 2) * TREE_ROW_HEIGHT;

    assert.deepEqual(dropTargetAtOffset(state, note, below), { kind: "root-gap" });
    assert.equal(dropTargetAtOffset(state, note, -4), null);
    assert.equal(dropTargetAtOffset(state, note, offsetIn(session, note, 0.5)), null);
  });
});

test("a folder cannot be dropped inside its own subtree", async () => {
  await withSession(async (session) => {
    const outer = await createFolder(session, null);
    const inner = await createFolder(session, outer);
    const deep = await createNote(session, inner);
    await expand(session, outer);
    await expand(session, inner);
    const state = session.store.getState();

    assert.equal(dropTargetAtOffset(state, outer, offsetIn(session, inner, 0.5)), null);
    assert.equal(dropTargetAtOffset(state, outer, offsetIn(session, deep, 0.2)), null);
  });
});

test("dropping before a row reorders the dragged node in front of it", async () => {
  await withSession(async (session) => {
    const first = await createNote(session, null);
    const second = await createNote(session, null);
    const state = session.store.getState();
    const target = dropTargetAtOffset(state, second, offsetIn(session, first, 0.2));
    assert.ok(target);
    const [move] = dropMoves(state.nodes, [second], target);
    assert.ok(move);

    await placeNode(session, second, move.placement);
    const siblings = session.store.getState().childrenByParent.get(null) ?? [];
    assert.equal(siblings.indexOf(second) + 1, siblings.indexOf(first));
  });
});

test("only the inside of a closed folder opens under a resting drag", async () => {
  await withSession(async (session) => {
    const folder = await createFolder(session, null);
    if (session.store.getState().expandedIds.has(folder)) {
      session.store.toggleExpanded(folder);
    }
    const state = session.store.getState();

    assert.equal(hoverExpands(state, { kind: "row", id: folder, zone: "inside" }), folder);
    assert.equal(hoverExpands(state, { kind: "row", id: folder, zone: "before" }), null);
    assert.equal(hoverExpands(state, { kind: "root-gap" }), null);
    assert.equal(hoverExpands(state, null), null);
    session.store.toggleExpanded(folder);
    assert.equal(
      hoverExpands(session.store.getState(), { kind: "row", id: folder, zone: "inside" }),
      null,
    );
  });
});

test("a hover is reported once per quarter row", () => {
  assert.equal(hoverBand(0), hoverBand(TREE_ROW_HEIGHT * 0.2));
  assert.notEqual(hoverBand(TREE_ROW_HEIGHT * 0.2), hoverBand(TREE_ROW_HEIGHT * 0.3));
  assert.notEqual(hoverBand(TREE_ROW_HEIGHT * 0.7), hoverBand(TREE_ROW_HEIGHT * 0.8));
});

test("undoing a move puts the node back in its slot", async () => {
  await withSession(async (session) => {
    const folder = await createFolder(session, null);
    const first = await createNote(session, null);
    const second = await createNote(session, null);
    const before = currentPlacement(session.store.getState(), first);
    await moveNode(session, first, folder);
    assert.equal(session.store.getState().nodes.get(first)?.parentId, folder);

    await restoreNodePlacement(session, first, before);
    const siblings = session.store.getState().childrenByParent.get(null) ?? [];
    assert.equal(session.store.getState().nodes.get(first)?.parentId, null);
    assert.equal(siblings.indexOf(first) + 1, siblings.indexOf(second));
  });
});

test("the list scrolls only while the drag rests near an edge", () => {
  assert.equal(edgeScrollStep(10, 600), -EDGE_SCROLL_STEP_PX);
  assert.equal(edgeScrollStep(300, 600), 0);
  assert.equal(edgeScrollStep(590, 600), EDGE_SCROLL_STEP_PX);
});
