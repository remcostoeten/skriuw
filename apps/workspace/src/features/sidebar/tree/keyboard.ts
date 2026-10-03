import type { KeyboardEvent } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { dragRoots, dropMoves, moveDropTarget } from "../drag/rules";
import type { MoveMode } from "../drag/move-mode";
import { focusTreeItem, openRowContextMenu, type TreeRef } from "./focus";
import { activateNote, moveNodes, moveWithinSiblings, trashSelectedNodes } from "./operations";

export type TreeKeyboard = {
  store: RendererStore;
  treeRef: TreeRef;
  moveMode: MoveMode;
  openSearch: () => void;
};

function isPlainArrow(event: KeyboardEvent): boolean {
  return (
    (event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight") &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function handleMoveModeKey(event: KeyboardEvent, keyboard: TreeKeyboard): boolean {
  const { store, moveMode } = keyboard;
  const moveIds = moveMode.ids;
  if (moveIds === null) {
    return false;
  }
  const state = store.getState();
  if (event.key === "Escape") {
    event.preventDefault();
    moveMode.cancel();
    return true;
  }
  if (event.key === "Enter" || event.key === " " || event.key === "m" || event.key === "M") {
    event.preventDefault();
    const cargo = moveIds.filter((id) => state.nodes.has(id));
    const moves = dropMoves(state.nodes, cargo, moveDropTarget(state.nodes, state.focusedNodeId));
    if (moves.length > 0) {
      moveNodes(store, moves);
      moveMode.cancel();
    }
    return true;
  }
  return !isPlainArrow(event);
}

export function handleTreeKeyDown(event: KeyboardEvent, keyboard: TreeKeyboard): void {
  const { store, treeRef, moveMode } = keyboard;
  const state = store.getState();
  const focusedId = state.focusedNodeId;
  if (state.editingNodeId !== null) {
    return;
  }
  const focusIndex = focusedId ? state.visibleIds.indexOf(focusedId) : -1;
  const focused = focusedId ? state.nodes.get(focusedId) : undefined;
  if (handleMoveModeKey(event, keyboard)) {
    return;
  }
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "Enter")) {
    event.preventDefault();
    if (focusedId) {
      openRowContextMenu(treeRef, focusedId);
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "a" || event.key === "A")) {
    event.preventDefault();
    store.selectAllTreeNodes();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "f" || event.key === "F")) {
    event.preventDefault();
    keyboard.openSearch();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D")) {
    if (store.clearTreeSelection()) {
      event.preventDefault();
    }
    return;
  }
  if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    if (focusedId) {
      store.selectTreeNode(focusedId, "replace");
      moveWithinSiblings(store, focusedId, event.key === "ArrowUp" ? -1 : 1);
      event.preventDefault();
    }
    return;
  }
  switch (event.key) {
    case "ArrowDown": {
      const next = state.visibleIds[focusIndex + 1] ?? state.visibleIds[0];
      if (next) {
        if (event.shiftKey) {
          store.selectTreeNode(next, "range");
        }
        store.setFocusedNode(next);
        focusTreeItem(treeRef, next);
      }
      event.preventDefault();
      return;
    }
    case "ArrowUp": {
      const next =
        focusIndex > 0
          ? state.visibleIds[focusIndex - 1]
          : state.visibleIds[state.visibleIds.length - 1];
      if (next) {
        if (event.shiftKey) {
          store.selectTreeNode(next, "range");
        }
        store.setFocusedNode(next);
        focusTreeItem(treeRef, next);
      }
      event.preventDefault();
      return;
    }
    case "ArrowRight": {
      if (focused?.kind === "folder") {
        if (!state.expandedIds.has(focused.id)) {
          store.toggleExpanded(focused.id);
        } else {
          const firstChild = state.childrenByParent.get(focused.id)?.[0];
          if (firstChild) {
            store.setFocusedNode(firstChild);
            focusTreeItem(treeRef, firstChild);
          }
        }
        event.preventDefault();
      }
      return;
    }
    case "ArrowLeft": {
      if (focused?.kind === "folder" && state.expandedIds.has(focused.id)) {
        store.toggleExpanded(focused.id);
      } else if (focused?.parentId) {
        store.setFocusedNode(focused.parentId);
        focusTreeItem(treeRef, focused.parentId);
      }
      event.preventDefault();
      return;
    }
    case "Enter": {
      if (focused) {
        store.selectTreeNode(focused.id, "replace");
      }
      if (focused?.kind === "note") {
        activateNote(store, focused.id);
      } else if (focused) {
        store.toggleExpanded(focused.id);
      }
      event.preventDefault();
      return;
    }
    case "F2":
    case "r":
    case "R": {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (focusedId) {
        store.selectTreeNode(focusedId, "replace");
        store.setEditingNode(focusedId);
        event.preventDefault();
      }
      return;
    }
    case "m":
    case "M": {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (focusedId) {
        const cargo = state.selectedNodeIds.has(focusedId)
          ? dragRoots(
              state.nodeOrder.filter((id) => state.selectedNodeIds.has(id)),
              state.nodes,
            )
          : [focusedId];
        moveMode.start(cargo);
        event.preventDefault();
      }
      return;
    }
    case "Delete": {
      if (focusedId) {
        trashSelectedNodes(store, focusedId);
        event.preventDefault();
      }
      return;
    }
    case "Escape": {
      if (store.clearTreeSelection()) {
        event.preventDefault();
      }
      return;
    }
    default:
  }
}
