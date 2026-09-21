import type {
  NodePlacement,
  WorkspaceOperation,
} from "@skriuw/renderer-core/contracts/workspace";
import type {
  RendererState,
  RendererStore,
} from "@skriuw/renderer-core/store/types";
import { commitOperations, type WorkspaceSession } from "../bridge/commit";
import { newNodeId } from "./identity";

export type TrashedNode = {
  id: string;
  title: string;
  /** Where the subtree sat, so undo puts it back in its own slot rather than at the end. */
  placement: NodePlacement;
};

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };

export async function createNote(
  session: WorkspaceSession,
  parentId: string | null,
): Promise<string> {
  const id = newNodeId();
  const at = Date.now();
  await commitOperations(session, [
    {
      type: "create_note",
      id,
      title: "Untitled",
      placement: { parentId, position: { type: "last" } },
      documentJson: EMPTY_DOCUMENT,
      markdown: "",
      at,
    },
    { type: "set_active_note", noteId: id },
  ]);
  return id;
}

export async function createFolder(
  session: WorkspaceSession,
  parentId: string | null,
): Promise<string> {
  const id = newNodeId();
  await commitOperations(session, [
    {
      type: "create_folder",
      id,
      title: "New folder",
      placement: { parentId, position: { type: "last" } },
      at: Date.now(),
    },
  ]);
  return id;
}

export async function renameNode(
  session: WorkspaceSession,
  id: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim();
  const current = session.store.getState().nodes.get(id);
  if (!current || trimmed.length === 0 || trimmed === current.title) {
    return;
  }
  await commitOperations(session, [{ type: "rename_node", id, title: trimmed, at: Date.now() }]);
}

export async function moveNode(
  session: WorkspaceSession,
  id: string,
  parentId: string | null,
): Promise<void> {
  const current = session.store.getState().sourceNodes.get(id);
  if (!current || current.parentId === parentId) {
    return;
  }
  await commitOperations(session, [
    {
      type: "move_node",
      id,
      placement: { parentId, position: { type: "last" } },
      at: Date.now(),
    },
  ]);
}

export async function setNodePinned(
  session: WorkspaceSession,
  id: string,
  pinned: boolean,
): Promise<void> {
  await commitOperations(session, [{ type: "set_node_pinned", id, pinned, at: Date.now() }]);
}

/**
 * The slot a subtree occupies right now: its parent, and the sibling it sits
 * in front of. Captured before the trash so the undo restores the node where
 * it was rather than appending it to its parent.
 */
export function currentPlacement(state: RendererState, id: string): NodePlacement {
  const node = state.nodes.get(id);
  const parentId = node?.parentId ?? null;
  const siblings = state.childrenByParent.get(parentId) ?? [];
  const position = siblings.indexOf(id);
  const anchorId = position >= 0 ? siblings[position + 1] : undefined;
  return {
    parentId,
    position: anchorId === undefined ? { type: "last" } : { type: "before", anchorId },
  };
}

/**
 * Trashes a subtree and reports what undo needs. The note that was open is
 * handed to the note beside it, so the editor never holds a trashed document.
 */
export async function trashNode(
  session: WorkspaceSession,
  id: string,
): Promise<TrashedNode> {
  const state = session.store.getState();
  const trashed: TrashedNode = {
    id,
    title: state.nodes.get(id)?.title ?? "Untitled",
    placement: currentPlacement(state, id),
  };
  const operations: WorkspaceOperation[] = [{ type: "trash_subtree", rootId: id, at: Date.now() }];
  const nextActive = nextActiveNote(state, id);
  if (nextActive !== state.activeNoteId) {
    operations.push({ type: "set_active_note", noteId: nextActive });
  }
  await commitOperations(session, operations);
  return trashed;
}

export async function restoreNode(
  session: WorkspaceSession,
  trashed: TrashedNode,
): Promise<void> {
  const operations: WorkspaceOperation[] = [
    {
      type: "restore_subtree",
      rootId: trashed.id,
      placement: restorablePlacement(session.store.getState(), trashed.placement),
      at: Date.now(),
    },
  ];
  if (session.store.getState().sourceNodes.get(trashed.id)?.kind === "note") {
    operations.push({ type: "set_active_note", noteId: trashed.id });
  }
  await commitOperations(session, operations);
}

export async function purgeNode(session: WorkspaceSession, id: string): Promise<void> {
  await commitOperations(session, [
    { type: "purge_subtree", rootId: id, trashedBefore: Date.now() },
  ]);
}

/** Folders a node can be moved into: every folder but itself and its own descendants. */
export function moveTargets(state: RendererState, id: string): string[] {
  const blocked = new Set<string>([id]);
  const targets: string[] = [];
  for (const candidate of state.nodeOrder) {
    const node = state.nodes.get(candidate);
    if (!node) {
      continue;
    }
    if (node.parentId !== null && blocked.has(node.parentId)) {
      blocked.add(candidate);
      continue;
    }
    if (node.kind === "folder" && !blocked.has(candidate)) {
      targets.push(candidate);
    }
  }
  return targets;
}

export function activateNote(store: RendererStore, id: string | null): void {
  store.setActiveNote(id);
  store.setFocusedNode(id);
}

/** A parent that was trashed in the meantime cannot take its child back; the root can. */
function restorablePlacement(state: RendererState, placement: NodePlacement): NodePlacement {
  if (placement.parentId !== null && !state.nodes.has(placement.parentId)) {
    return { parentId: null, position: { type: "last" } };
  }
  if (placement.position.type === "before" && !state.nodes.has(placement.position.anchorId)) {
    return { parentId: placement.parentId, position: { type: "last" } };
  }
  return placement;
}

/** The note the shell opens once `id` and its descendants are gone. */
function nextActiveNote(state: RendererState, id: string): string | null {
  const active = state.activeNoteId;
  if (active === null) {
    return null;
  }
  const removed = new Set<string>([id]);
  for (const candidate of state.nodeOrder) {
    const parentId = state.nodes.get(candidate)?.parentId;
    if (parentId != null && removed.has(parentId)) {
      removed.add(candidate);
    }
  }
  if (!removed.has(active)) {
    return active;
  }
  const position = state.noteIds.indexOf(active);
  const after = state.noteIds.slice(position + 1).find((noteId) => !removed.has(noteId));
  if (after !== undefined) {
    return after;
  }
  const before = state.noteIds.slice(0, Math.max(0, position)).filter((noteId) => !removed.has(noteId));
  return before[before.length - 1] ?? null;
}
