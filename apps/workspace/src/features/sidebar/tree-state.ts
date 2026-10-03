import { focusedPaneNoteId } from "@/features/notes/navigation";
import { ancestorIds, flattenVisible } from "@skriuw/renderer-core/store/tree";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

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
