import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { requestNoteShare } from "@/features/sharing/share-dialog-controller";
import { requestTemplatePicker } from "@/features/templates/picker";
import { toggleNodeLock } from "@/features/lock/lock";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  createFolder,
  createNote,
  exportNoteAsMarkdown,
  openBeside,
  openNoteInTab,
  selectedRootsFor,
  setAllFoldersExpanded,
  setNodePinned,
  trashSelectedNodes,
} from "../tree/operations";

export type MenuShortcuts = Record<string, () => void>;

export function itemMenuShortcuts(
  store: RendererStore,
  id: string,
  onMove: (ids: readonly string[]) => void,
): MenuShortcuts {
  const state = store.getState();
  const node = state.nodes.get(id);
  const actions: MenuShortcuts = { d: () => trashSelectedNodes(store, id) };
  if (!node || state.selectedNodeIds.size > 1) {
    return actions;
  }
  const isPinned = (state.sourceNodes.get(id)?.pinnedAt ?? null) !== null;
  Object.assign(actions, {
    r: () => store.setEditingNode(id),
    p: () => setNodePinned(store, id, !isPinned),
    l: () => toggleNodeLock(store, id),
    m: () => onMove(selectedRootsFor(store, id)),
  });
  if (node.kind === "folder") {
    Object.assign(actions, {
      n: () => createNote(store, id),
      t: () => requestTemplatePicker(id),
      f: () => createFolder(store, id),
    });
  } else {
    Object.assign(actions, {
      o: () => openNoteInTab(store, id),
      b: () => openBeside(store, id),
      e: () => void exportNoteAsMarkdown(store, id),
      s: () => requestNoteShare(id),
    });
  }
  return actions;
}

export function rootMenuShortcuts(store: RendererStore): MenuShortcuts {
  return {
    n: () => createNote(store, null),
    t: () => requestTemplatePicker(null),
    f: () => createFolder(store, null),
    e: () => setAllFoldersExpanded(store, true),
    c: () => setAllFoldersExpanded(store, false),
  };
}

function closeContextMenu(element: HTMLElement): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

export function runMenuShortcut(event: ReactKeyboardEvent, actions: MenuShortcuts): void {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return;
  }
  const key = event.key === "Delete" || event.key === "Backspace" ? "d" : event.key.toLowerCase();
  const action = actions[key];
  if (action === undefined) {
    return;
  }
  event.preventDefault();
  closeContextMenu(event.currentTarget as HTMLElement);
  action();
}
