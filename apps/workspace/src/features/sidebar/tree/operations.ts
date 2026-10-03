import { moveNode, restoreSubtree, trashSubtrees } from "@/features/notes/operations";
import {
  formatFolderStructure,
  type FolderStructureFormat,
} from "@/features/transfer/folder-structure";
import { showToast } from "@/shared/ui/toast";
import { ancestorIds, flattenVisible, selectedTreeRoots } from "@skriuw/renderer-core/store/tree";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { nextFolderExpansion } from "./expansion";

export { activateNote } from "@/features/notes/navigation";
export {
  createFolder,
  createNote,
  moveNode,
  moveNodes,
  renameNode,
  setNodePinned,
} from "@/features/notes/operations";
export { setAllFoldersExpanded } from "@/features/sidebar/tree-state";
export { openBeside, openNoteInTab } from "@/features/workspace-layout/panes";
export { exportNoteAsMarkdown } from "@/features/transfer/actions";
export { canShareNotes, shareNoteAsText } from "@/features/transfer/share-note";
export {
  FOLDER_STRUCTURE_DEPTHS,
  type FolderStructureFormat,
} from "@/features/transfer/folder-structure";

export function toggleAllFolders(store: RendererStore): void {
  const state = store.getState();
  const expandedIds = nextFolderExpansion(state.nodes, state.expandedIds);
  store.update((current) => ({
    ...current,
    expandedIds,
    visibleIds: flattenVisible(current.nodes, current.childrenByParent, expandedIds),
  }));
}

export function revealNode(store: RendererStore, id: string): void {
  const state = store.getState();
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
}

function isInSubtree(state: RendererState, nodeId: string, rootId: string): boolean {
  let currentId: string | null = nodeId;
  while (currentId !== null) {
    if (currentId === rootId) {
      return true;
    }
    currentId = state.sourceNodes.get(currentId)?.parentId ?? null;
  }
  return false;
}

export function moveTargetFolders(
  state: RendererState,
  movedId: string,
): { id: string; title: string }[] {
  const targets: { id: string; title: string }[] = [];
  for (const node of state.sourceNodes.values()) {
    if (node.kind !== "folder" || node.deletedAt !== null) {
      continue;
    }
    if (isInSubtree(state, node.id, movedId)) {
      continue;
    }
    targets.push({ id: node.id, title: node.title });
  }
  return targets.sort((left, right) => left.title.localeCompare(right.title));
}

export function moveWithinSiblings(store: RendererStore, id: string, direction: -1 | 1): void {
  const state = store.getState();
  const node = state.nodes.get(id);
  if (!node) {
    return;
  }
  const siblings = state.childrenByParent.get(node.parentId) ?? [];
  const index = siblings.indexOf(id);
  const anchorId = siblings[index + direction];
  if (!anchorId) {
    return;
  }
  moveNode(store, id, {
    parentId: node.parentId,
    position: direction === -1 ? { type: "before", anchorId } : { type: "after", anchorId },
  });
}

export function selectedRootsFor(store: RendererStore, id: string): string[] {
  const state = store.getState();
  if (!state.selectedNodeIds.has(id)) {
    return [id];
  }
  return selectedTreeRoots(state.selectedNodeIds, state.nodes);
}

export function trashSelectedNodes(store: RendererStore, id: string): void {
  const roots = selectedRootsFor(store, id);
  const first = roots[0];
  if (first === undefined) {
    return;
  }
  const title = store.getState().nodes.get(first)?.title ?? "Untitled";
  trashSubtrees(store, roots);
  showToast({
    message:
      roots.length === 1 ? `Moved “${title}” to trash` : `Moved ${roots.length} items to trash`,
    action: {
      label: "Undo",
      run: () => {
        for (const rootId of roots) {
          restoreSubtree(store, rootId);
        }
      },
    },
  });
}

export function copyFolderStructure(
  store: RendererStore,
  id: string,
  format: FolderStructureFormat,
  maxDepth: number | null,
): void {
  const text = formatFolderStructure(store.getState(), id, format, maxDepth);
  if (text === null) {
    return;
  }
  const noun = format === "json" ? "JSON" : "file tree";
  void navigator.clipboard
    ?.writeText(text)
    .then(() => showToast({ message: `Copied folder as ${noun}` }))
    .catch((error: unknown) =>
      showToast({
        message: `Could not copy ${noun}: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
}
