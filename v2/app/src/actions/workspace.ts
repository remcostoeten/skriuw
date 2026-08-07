import { applyWorkspaceOperations, bootstrapWorkspace } from "../bridge/commands";
import { envelope } from "../contracts/workspace";
import type { NodePlacement, WorkspaceOperation } from "../contracts/workspace";
import { buildRestoreOperation } from "../history/version-model";
import { flushPendingWork } from "../lifecycle/pending-work";
import { opensNotesInTabs } from "../settings/settings-model";
import {
  SECONDARY_PANE_ID,
  openBeside as openBesidePanes,
  secondaryPane,
} from "../store/panes";
import { ancestorIds, flattenVisible } from "../store/tree";
import type { RendererState, RendererStore } from "../store/types";
import type { ReferenceOperation } from "../references/types";
import { planTemplateNote, type NoteTemplate } from "../templates/note-templates";
import { planNoteDuplicate } from "./duplicate-note";

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

function initialNoteDocument(title: string) {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
      { type: "paragraph" },
    ],
  };
}

export function createNote(store: RendererStore, parentId: string | null): void {
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = "Untitled";
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id,
      title,
      placement: { parentId, position: { type: "last" } },
      documentJson: initialNoteDocument(title),
      markdown: `# ${title}\n\n`,
      at: now,
    },
    { type: "set_active_note", noteId: id },
  ];
  void commitOperations(store, operations).catch(reportRejection("create note"));
}

export function createNoteFromTemplate(
  store: RendererStore,
  template: NoteTemplate,
  parentId: string | null,
): void {
  const plan = planTemplateNote(template, parentId, Date.now(), () =>
    crypto.randomUUID(),
  );
  void commitOperations(store, [...plan.operations]).catch(
    reportRejection("create note from template"),
  );
}

export function createLinkedNote(store: RendererStore, id: string, title: string): void {
  const previousActive = store.getState().activeNoteId;
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id,
      title,
      placement: { parentId: null, position: { type: "last" } },
      documentJson: initialNoteDocument(title),
      markdown: `# ${title}\n\n`,
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

/**
 * The sequence `previousNote`/`nextNote` walk: the focused pane's tab strip
 * when notes open in tabs (and more than one tab is open), the sidebar's
 * note order otherwise.
 */
export function noteNavigationOrder(state: RendererState): readonly string[] {
  if (opensNotesInTabs(state.settings)) {
    const pane =
      state.panes.find((entry) => entry.paneId === state.focusedPaneId) ??
      state.panes[0];
    if (pane && pane.openNoteIds.length > 1) {
      return pane.openNoteIds;
    }
  }
  return state.noteIds;
}

export function navigateNote(store: RendererStore, direction: -1 | 1): void {
  const state = store.getState();
  if (state.activeNoteId === null) {
    return;
  }
  const order = noteNavigationOrder(state);
  const index = order.indexOf(state.activeNoteId);
  if (index < 0 || order.length < 2) {
    return;
  }
  const nextId = order[(index + direction + order.length) % order.length];
  if (nextId !== undefined) {
    activateNote(store, nextId);
  }
}

/**
 * The note a whole-note action targets: the focused pane's note in a split,
 * falling back to the workspace's active note. Null when no note is open.
 */
export function focusedPaneNoteId(state: RendererState): string | null {
  const pane = state.panes.find((entry) => entry.paneId === state.focusedPaneId);
  const noteId = pane?.activeNoteId ?? state.activeNoteId;
  return noteId !== null && state.nodes.get(noteId)?.kind === "note" ? noteId : null;
}

/**
 * The sidebar's focused note, for actions that should follow the tree's cursor
 * while the sidebar owns the keyboard. Null when the focused row is a folder,
 * or nothing is focused, so callers fall back to the open note.
 */
export function focusedTreeNoteId(state: RendererState): string | null {
  const id = state.focusedNodeId;
  if (id === null) {
    return null;
  }
  return state.nodes.get(id)?.kind === "note" ? id : null;
}

/**
 * The sidebar's focused folder, for actions that need a drop target when
 * nothing more specific is selected (e.g. importing a file into "wherever
 * the sidebar is pointed"). Null when the focused row isn't a folder, or
 * nothing is focused, so callers fall back to the workspace root.
 */
export function focusedFolderId(state: RendererState): string | null {
  const id = state.focusedNodeId;
  if (id === null) {
    return null;
  }
  return state.nodes.get(id)?.kind === "folder" ? id : null;
}

/**
 * Expands the ancestors of `id` and focuses its row, so a node reached from
 * outside the sidebar becomes visible in the tree.
 */
export function revealNodeInTree(store: RendererStore, id: string): boolean {
  const state = store.getState();
  if (!state.nodes.has(id)) {
    return false;
  }
  const expandedIds = new Set(state.expandedIds);
  for (const ancestorId of ancestorIds(state.nodes, id)) {
    expandedIds.add(ancestorId);
  }
  store.update((current) => ({
    ...current,
    expandedIds,
    focusedNodeId: id,
    visibleIds: flattenVisible(current.nodes, current.childrenByParent, expandedIds),
  }));
  return true;
}

/** Expands or collapses every folder in the tree at once. */
export function setAllFoldersExpanded(store: RendererStore, expanded: boolean): void {
  store.update((state) => {
    const folderIds = [...state.nodes.values()]
      .filter((node) => node.kind === "folder")
      .map((node) => node.id);
    const expandedIds = new Set(expanded ? folderIds : []);
    return {
      ...state,
      expandedIds,
      visibleIds: flattenVisible(state.nodes, state.childrenByParent, expandedIds),
    };
  });
}

/**
 * Starts the inline rename of the open note — the same editing state the
 * sidebar's own F2 uses, pointed at the open note instead of the focused row.
 */
export function renameCurrentNote(store: RendererStore): boolean {
  const state = store.getState();
  const noteId = focusedPaneNoteId(state);
  if (noteId === null) {
    return false;
  }
  if (state.editingNodeId === noteId) {
    return true;
  }
  revealNodeInTree(store, noteId);
  store.setEditingNode(noteId);
  return true;
}


/**
 * The note that takes over when `noteId` leaves the workspace: its successor in
 * the navigation order, or its predecessor when it was last. Null when nothing
 * remains, which leaves the workspace on its empty state.
 */
export function nextNoteAfterRemoval(
  state: RendererState,
  noteId: string,
): string | null {
  const order = noteNavigationOrder(state);
  const index = order.indexOf(noteId);
  if (index < 0) {
    return null;
  }
  return order[index + 1] ?? order[index - 1] ?? null;
}

export type TrashedNote = { noteId: string; title: string };

/**
 * Soft-deletes the open note down the sidebar's trash path, after flushing
 * pending edits so the trashed revision matches what was on screen. Returns what
 * was trashed so callers can offer an undo.
 */
export async function trashCurrentNote(
  store: RendererStore,
): Promise<TrashedNote | null> {
  const noteId = focusedPaneNoteId(store.getState());
  if (noteId === null) {
    return null;
  }
  await flushPendingWork();
  const state = store.getState();
  if (state.nodes.get(noteId)?.kind !== "note") {
    return null;
  }
  const title = state.nodes.get(noteId)?.title ?? "Untitled";
  const nextNoteId = nextNoteAfterRemoval(state, noteId);
  trashSubtree(store, noteId);
  activateNote(store, nextNoteId);
  return { noteId, title };
}

/** Undoes `trashCurrentNote`: restores the subtree and reopens the note. */
export function restoreTrashedNote(store: RendererStore, noteId: string): void {
  restoreSubtree(store, noteId);
  activateNote(store, noteId);
}

export type DuplicatedNote = { noteId: string; title: string };

/**
 * Opens `noteId` in whichever pane has focus. Creating a note always makes it
 * the workspace's active note, which is the primary pane — so when the split
 * pane has focus the primary pane is handed `restoreActiveNoteId` back and the
 * new note goes to the split instead.
 */
function openInFocusedPane(
  store: RendererStore,
  noteId: string,
  restoreActiveNoteId: string | null,
): void {
  const state = store.getState();
  if (state.focusedPaneId !== SECONDARY_PANE_ID || secondaryPane(state.panes) === null) {
    activateNote(store, noteId);
    return;
  }
  activateNote(store, restoreActiveNoteId);
  store.update((current) => ({
    ...current,
    panes: openBesidePanes(current.panes, noteId),
    focusedNodeId: noteId,
  }));
}

/**
 * Duplicates the open note into the slot right after it, after flushing pending
 * edits so the copy matches what was on screen. Content, properties, and
 * reference chips come across; note, block, and property identities are fresh,
 * the copy is never pinned, and its created-at is now. The copy opens in the
 * pane the original was open in.
 */
export async function duplicateCurrentNote(
  store: RendererStore,
): Promise<DuplicatedNote | null> {
  const noteId = focusedPaneNoteId(store.getState());
  if (noteId === null) {
    return null;
  }
  await flushPendingWork();
  const state = store.getState();
  const previousActiveNoteId = state.activeNoteId;
  const plan = planNoteDuplicate(state, noteId, Date.now(), () => crypto.randomUUID());
  if (plan === null) {
    return null;
  }
  try {
    await commitOperations(store, [...plan.operations]);
  } catch (error) {
    reportRejection("duplicate note")(error);
    return null;
  }
  openInFocusedPane(store, plan.noteId, previousActiveNoteId);
  return { noteId: plan.noteId, title: plan.title };
}
