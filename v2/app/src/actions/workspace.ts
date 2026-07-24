import { applyWorkspaceOperations, bootstrapWorkspace } from "../bridge/commands";
import { envelope } from "../contracts/workspace";
import type { NodePlacement, WorkspaceOperation } from "../contracts/workspace";
import { buildRestoreOperation } from "../history/version-model";
import type { RendererStore } from "../store/types";
import type { ReferenceOperation } from "../references/types";

export function commitReferenceOperations(
  store: RendererStore,
  operations: readonly ReferenceOperation[],
): void {
  if (!store.applyReferenceOperations(operations)) {
    return;
  }
  void applyWorkspaceOperations(operations.map((operation) => envelope(operation)))
    .catch(async (error) => {
      store.replaceFromSnapshot(await bootstrapWorkspace());
      throw error;
    })
    .catch(reportRejection("reference update"));
}

/**
 * Applies operations optimistically, submits them to the backend, and
 * reconciles ranks and revisions from the acknowledgement. On rejection the
 * canonical snapshot is re-bootstrapped so the renderer never drifts from
 * durable state.
 */
export async function commitOperations(
  store: RendererStore,
  operations: WorkspaceOperation[],
): Promise<void> {
  store.applyOperations(operations);
  try {
    const ack = await applyWorkspaceOperations(operations.map(envelope));
    store.applyAck(ack);
  } catch (error) {
    const snapshot = await bootstrapWorkspace();
    store.replaceFromSnapshot(snapshot);
    throw error;
  }
}

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}

export function createNote(store: RendererStore, parentId: string | null): void {
  const id = crypto.randomUUID();
  const now = Date.now();
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id,
      title: "Untitled",
      placement: { parentId, position: { type: "last" } },
      documentJson: { type: "doc", content: [{ type: "paragraph" }] },
      markdown: "",
      at: now,
    },
    { type: "set_active_note", noteId: id },
  ];
  void commitOperations(store, operations)
    .then(() => {
      store.setEditingNode(id);
    })
    .catch(reportRejection("create note"));
  store.setEditingNode(id);
}

export function createLinkedNote(store: RendererStore, id: string, title: string): void {
  const previousActive = store.getState().activeNoteId;
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id,
      title,
      placement: { parentId: null, position: { type: "last" } },
      documentJson: { type: "doc", content: [{ type: "paragraph" }] },
      markdown: "",
      at: Date.now(),
    },
    { type: "set_active_note", noteId: previousActive },
  ];
  void commitOperations(store, operations).catch(reportRejection("create linked note"));
}

export function createFolder(store: RendererStore, parentId: string | null): void {
  const id = crypto.randomUUID();
  const operations: WorkspaceOperation[] = [
    {
      type: "create_folder",
      id,
      title: "New folder",
      placement: { parentId, position: { type: "last" } },
      at: Date.now(),
    },
  ];
  void commitOperations(store, operations).catch(reportRejection("create folder"));
  store.setEditingNode(id);
}

export function renameNode(store: RendererStore, id: string, title: string): void {
  const trimmed = title.trim();
  const current = store.getState().nodes.get(id);
  store.setEditingNode(null);
  if (!current || trimmed.length === 0 || trimmed === current.title) {
    return;
  }
  void commitOperations(store, [
    { type: "rename_node", id, title: trimmed, at: Date.now() },
  ]).catch(reportRejection("rename"));
}

export function trashSubtree(store: RendererStore, rootId: string): void {
  trashSubtrees(store, [rootId]);
}

export function trashSubtrees(store: RendererStore, rootIds: readonly string[]): void {
  const at = Date.now();
  void commitOperations(
    store,
    rootIds.map((rootId) => ({ type: "trash_subtree", rootId, at })),
  ).catch(reportRejection("trash"));
}

export function restoreSubtree(store: RendererStore, rootId: string): void {
  const source = store.getState().sourceNodes.get(rootId);
  const parentStillAvailable =
    source?.parentId != null &&
    store.getState().nodes.has(source.parentId);
  const placement: NodePlacement = {
    parentId: parentStillAvailable ? (source?.parentId ?? null) : null,
    position: { type: "last" },
  };
  void commitOperations(store, [
    { type: "restore_subtree", rootId, placement, at: Date.now() },
  ]).catch(reportRejection("restore"));
}

export function purgeSubtree(store: RendererStore, rootId: string): void {
  void commitOperations(store, [
    { type: "purge_subtree", rootId, trashedBefore: Date.now() },
  ]).catch(reportRejection("delete permanently"));
}

export function emptyTrash(store: RendererStore, rootIds: readonly string[]): void {
  const trashedBefore = Date.now();
  void commitOperations(
    store,
    rootIds.map((rootId) => ({ type: "purge_subtree", rootId, trashedBefore })),
  ).catch(reportRejection("empty trash"));
}

export function setNodePinned(store: RendererStore, id: string, pinned: boolean): void {
  void commitOperations(store, [
    { type: "set_node_pinned", id, pinned, at: Date.now() },
  ]).catch(reportRejection(pinned ? "pin" : "unpin"));
}

export function moveNode(
  store: RendererStore,
  id: string,
  placement: NodePlacement,
): void {
  moveNodes(store, [{ id, placement }]);
}

export function moveNodes(
  store: RendererStore,
  moves: readonly { id: string; placement: NodePlacement }[],
): void {
  if (moves.length === 0) {
    return;
  }
  const at = Date.now();
  void commitOperations(
    store,
    moves.map(({ id, placement }) => ({ type: "move_node" as const, id, placement, at })),
  ).catch(reportRejection("move"));
}

export function restoreNoteVersion(
  store: RendererStore,
  noteId: string,
  versionMarkdown: string,
): Promise<void> {
  const record = store.getState().documents.get(noteId);
  if (!record) {
    return Promise.resolve();
  }
  return commitOperations(store, [
    buildRestoreOperation({
      noteId,
      versionMarkdown,
      expectedRevision: record.revision,
      at: Date.now(),
    }),
  ]);
}

export function activateNote(store: RendererStore, id: string | null): void {
  store.setActiveNote(id);
}
