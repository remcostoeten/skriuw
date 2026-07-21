import { memo, useEffect, useRef, useState } from "react";
import {
  activateNote,
  createFolder,
  createNote,
  moveNode,
  renameNode,
  restoreSubtree,
  trashSubtree,
} from "../actions/workspace";
import { useRendererSelector } from "../store/useRendererSelector";
import type { RendererState, RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

type MenuTarget = {
  id: string;
  x: number;
  y: number;
};

function sameIdList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function trashedRootIds(state: RendererState): string[] {
  const roots: string[] = [];
  for (const node of state.sourceNodes.values()) {
    if (node.deletedAt === null) {
      continue;
    }
    let ancestorTrashed = false;
    let parentId = node.parentId;
    while (parentId !== null) {
      const parent = state.sourceNodes.get(parentId);
      if (!parent) {
        break;
      }
      if (parent.deletedAt !== null) {
        ancestorTrashed = true;
        break;
      }
      parentId = parent.parentId;
    }
    if (!ancestorTrashed) {
      roots.push(node.id);
    }
  }
  return roots.sort();
}

function moveWithinSiblings(store: RendererStore, id: string, direction: -1 | 1): void {
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

export function Sidebar({ store }: Props) {
  const visibleIds = useRendererSelector(store, (state) => state.visibleIds);
  const trashedIds = useRendererSelector(store, trashedRootIds, sameIdList);
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  function onTreeKeyDown(event: React.KeyboardEvent): void {
    const state = store.getState();
    const focusedId = state.focusedNodeId;
    if (state.editingNodeId !== null) {
      return;
    }
    const focusIndex = focusedId ? state.visibleIds.indexOf(focusedId) : -1;
    const focused = focusedId ? state.nodes.get(focusedId) : undefined;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (focusedId) {
        moveWithinSiblings(store, focusedId, event.key === "ArrowUp" ? -1 : 1);
        event.preventDefault();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        const next = state.visibleIds[focusIndex + 1] ?? state.visibleIds[0];
        if (next) {
          store.setFocusedNode(next);
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
          store.setFocusedNode(next);
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
        }
        event.preventDefault();
        return;
      }
      case "Enter": {
        if (focused?.kind === "note") {
          activateNote(store, focused.id);
        } else if (focused) {
          store.toggleExpanded(focused.id);
        }
        event.preventDefault();
        return;
      }
      case "F2": {
        if (focusedId) {
          store.setEditingNode(focusedId);
          event.preventDefault();
        }
        return;
      }
      case "Delete": {
        if (focusedId) {
          trashSubtree(store, focusedId);
          event.preventDefault();
        }
        return;
      }
      default:
    }
  }

  const menuNode = menu ? store.getState().nodes.get(menu.id) : undefined;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Skriuw</span>
        <span className="sidebar-actions">
          <button
            type="button"
            className="sidebar-action"
            aria-label="New note"
            title="New note"
            onClick={() => createNote(store, null)}
          >
            +
          </button>
          <button
            type="button"
            className="sidebar-action"
            aria-label="New folder"
            title="New folder"
            onClick={() => createFolder(store, null)}
          >
            ⌸
          </button>
        </span>
      </div>
      <ul
        className="sidebar-tree"
        role="tree"
        aria-label="Workspace"
        tabIndex={0}
        onKeyDown={onTreeKeyDown}
      >
        {visibleIds.map((id) => (
          <SidebarRow
            key={id}
            store={store}
            id={id}
            onContextMenu={(x, y) => {
              store.setFocusedNode(id);
              setMenu({ id, x, y });
            }}
          />
        ))}
      </ul>
      {trashedIds.length > 0 && (
        <div className="sidebar-trash">
          <div className="sidebar-trash-header">Trash</div>
          <ul>
            {trashedIds.map((id) => (
              <TrashRow key={id} store={store} id={id} />
            ))}
          </ul>
        </div>
      )}
      {menu && menuNode && (
        <div
          className="context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              store.setEditingNode(menu.id);
            }}
          >
            Rename
          </button>
          {menuNode.kind === "folder" && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  createNote(store, menu.id);
                }}
              >
                New note inside
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  createFolder(store, menu.id);
                }}
              >
                New folder inside
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="is-destructive"
            onClick={() => {
              setMenu(null);
              trashSubtree(store, menu.id);
            }}
          >
            Move to trash
          </button>
        </div>
      )}
    </aside>
  );
}

type RowProps = {
  store: RendererStore;
  id: string;
  onContextMenu: (x: number, y: number) => void;
};

const SidebarRow = memo(function SidebarRow({ store, id, onContextMenu }: RowProps) {
  const node = useRendererSelector(store, (state) => state.nodes.get(id));
  const isActive = useRendererSelector(store, (state) => state.activeNoteId === id);
  const isFocused = useRendererSelector(store, (state) => state.focusedNodeId === id);
  const isExpanded = useRendererSelector(store, (state) => state.expandedIds.has(id));
  const isEditing = useRendererSelector(store, (state) => state.editingNodeId === id);
  if (!node) {
    return null;
  }
  const isFolder = node.kind === "folder";
  return (
    <li
      role="treeitem"
      aria-level={node.depth}
      aria-setsize={node.setSize}
      aria-posinset={node.posInSet}
      aria-selected={isActive}
      {...(isFolder ? { "aria-expanded": isExpanded } : {})}
    >
      {isEditing ? (
        <RenameInput store={store} id={id} initialTitle={node.title} depth={node.depth} />
      ) : (
        <button
          type="button"
          className={`tree-row${isActive ? " is-active" : ""}${isFocused ? " is-focused" : ""}`}
          style={{ paddingLeft: `${node.depth * 14}px` }}
          tabIndex={-1}
          onClick={() => {
            store.setFocusedNode(id);
            if (isFolder) {
              store.toggleExpanded(id);
            } else {
              activateNote(store, id);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(event.clientX, event.clientY);
          }}
        >
          <span className="tree-row-glyph">{isFolder ? (isExpanded ? "▾" : "▸") : "•"}</span>
          <span className="tree-row-title">{node.title}</span>
        </button>
      )}
    </li>
  );
});

type RenameProps = {
  store: RendererStore;
  id: string;
  initialTitle: string;
  depth: number;
};

function RenameInput({ store, id, initialTitle, depth }: RenameProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <input
      ref={inputRef}
      className="tree-rename-input"
      style={{ marginLeft: `${depth * 14}px` }}
      defaultValue={initialTitle}
      onBlur={(event) => renameNode(store, id, event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          renameNode(store, id, event.currentTarget.value);
        }
        if (event.key === "Escape") {
          store.setEditingNode(null);
        }
        event.stopPropagation();
      }}
    />
  );
}

type TrashRowProps = {
  store: RendererStore;
  id: string;
};

function TrashRow({ store, id }: TrashRowProps) {
  const title = useRendererSelector(
    store,
    (state) => state.sourceNodes.get(id)?.title ?? "",
  );
  return (
    <li className="trash-row">
      <span className="tree-row-title">{title}</span>
      <button type="button" className="sidebar-action" onClick={() => restoreSubtree(store, id)}>
        Restore
      </button>
    </li>
  );
}
