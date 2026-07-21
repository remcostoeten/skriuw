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
import { useRendererSelector } from "../store/use-renderer-selector";
import {
  FilePlusIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  NewFolderIcon,
  NewNoteIcon,
  PencilIcon,
  Trash2Icon,
} from "../shared/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../shared/ui/context-menu";
import type { RendererState, RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

type ContextTarget = { kind: "root" } | { kind: "item"; id: string };

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

function moveTargetFolders(state: RendererState, movedId: string): { id: string; title: string }[] {
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
  // A single shared context menu serves every row. Rows carry `data-row-key`;
  // right-clicking the list resolves the row under the cursor and points the
  // one menu at it, instead of mounting a Radix ContextMenu per row.
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);

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

  function closeContextMenu(element: HTMLElement): void {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  // While an item's context menu is open: "r" renames, Delete/Backspace/"d" deletes.
  function onContextMenuKeyDown(event: React.KeyboardEvent, id: string): void {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      closeContextMenu(event.currentTarget as HTMLElement);
      store.setEditingNode(id);
      return;
    }
    if (
      event.key === "Delete" ||
      event.key === "Backspace" ||
      event.key === "d" ||
      event.key === "D"
    ) {
      event.preventDefault();
      closeContextMenu(event.currentTarget as HTMLElement);
      trashSubtree(store, id);
    }
  }

  function onListContextMenu(event: React.MouseEvent): void {
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
    const id = rowEl?.getAttribute("data-row-key") ?? null;
    if (id === null) {
      setContextTarget({ kind: "root" });
      return;
    }
    store.setFocusedNode(id);
    setContextTarget({ kind: "item", id });
  }

  function renderMoveToSubmenu(id: string, parentId: string | null) {
    const folders = moveTargetFolders(store.getState(), id);
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger className="gap-2">
          <FolderInputIcon className="w-4 h-4" />
          Move to
          <ContextMenuShortcut className="mr-1">M</ContextMenuShortcut>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48">
          {parentId !== null && (
            <ContextMenuItem
              onClick={() => moveNode(store, id, { parentId: null, position: { type: "last" } })}
            >
              Root
            </ContextMenuItem>
          )}
          {folders.length > 0
            ? folders.map((folder) => (
                <ContextMenuItem
                  key={folder.id}
                  onClick={() =>
                    moveNode(store, id, { parentId: folder.id, position: { type: "last" } })
                  }
                >
                  {folder.title}
                </ContextMenuItem>
              ))
            : parentId === null && <ContextMenuItem disabled>No folders available</ContextMenuItem>}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }

  function renderRootContextItems() {
    return (
      <>
        <ContextMenuItem onClick={() => createNote(store, null)} className="gap-2">
          <FilePlusIcon className="w-4 h-4" />
          New note
        </ContextMenuItem>
        <ContextMenuItem onClick={() => createFolder(store, null)} className="gap-2">
          <FolderPlusIcon className="w-4 h-4" />
          New folder
        </ContextMenuItem>
      </>
    );
  }

  function renderItemContextItems(id: string) {
    const node = store.getState().nodes.get(id);
    if (!node) {
      return null;
    }
    return (
      <>
        <ContextMenuItem onClick={() => store.setEditingNode(id)} className="gap-2">
          <PencilIcon className="w-4 h-4" />
          Rename
          <ContextMenuShortcut>R</ContextMenuShortcut>
        </ContextMenuItem>
        {node.kind === "folder" && (
          <>
            <ContextMenuItem onClick={() => createNote(store, id)} className="gap-2">
              <FilePlusIcon className="w-4 h-4" />
              New note inside
            </ContextMenuItem>
            <ContextMenuItem onClick={() => createFolder(store, id)} className="gap-2">
              <FolderPlusIcon className="w-4 h-4" />
              New folder inside
            </ContextMenuItem>
          </>
        )}
        {renderMoveToSubmenu(id, node.parentId)}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => trashSubtree(store, id)}
          className="gap-2 text-[#ff808a] focus:bg-[#ff808a4d]"
        >
          <Trash2Icon className="w-4 h-4" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-action"
          aria-label="New note"
          title="New note"
          onClick={() => createNote(store, null)}
        >
          <NewNoteIcon size={18} />
        </button>
        <button
          type="button"
          className="sidebar-action"
          aria-label="New folder"
          title="New folder"
          onClick={() => createFolder(store, null)}
        >
          <NewFolderIcon size={18} />
        </button>
      </div>
      <ContextMenu onOpenChange={(open) => !open && setContextTarget(null)}>
        <ContextMenuTrigger asChild>
          <ul
            className="sidebar-tree"
            role="tree"
            aria-label="Workspace"
            tabIndex={0}
            onKeyDown={onTreeKeyDown}
            onContextMenu={onListContextMenu}
          >
            {visibleIds.map((id) => (
              <SidebarRow key={id} store={store} id={id} />
            ))}
          </ul>
        </ContextMenuTrigger>
        {contextTarget?.kind === "root" && (
          <ContextMenuContent className="w-48">{renderRootContextItems()}</ContextMenuContent>
        )}
        {contextTarget?.kind === "item" && (
          <ContextMenuContent
            className="w-48"
            onKeyDown={(event) => onContextMenuKeyDown(event, contextTarget.id)}
          >
            {renderItemContextItems(contextTarget.id)}
          </ContextMenuContent>
        )}
      </ContextMenu>
      {trashedIds.length > 0 && (
        <div className="sidebar-trash">
          <div className="sidebar-trash-header">
            <Trash2Icon size={12} />
            Trash
          </div>
          <ul>
            {trashedIds.map((id) => (
              <TrashRow key={id} store={store} id={id} />
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

type RowProps = {
  store: RendererStore;
  id: string;
};

const SidebarRow = memo(function SidebarRow({ store, id }: RowProps) {
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
          style={{ paddingLeft: `${12 + node.depth * 16}px` }}
          tabIndex={-1}
          data-row-key={id}
          onClick={() => {
            store.setFocusedNode(id);
            if (isFolder) {
              store.toggleExpanded(id);
            } else {
              activateNote(store, id);
            }
          }}
        >
          {isFolder && (
            <span className="tree-row-glyph">
              {isExpanded ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}
            </span>
          )}
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
      style={{ marginLeft: `${12 + depth * 16}px` }}
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
