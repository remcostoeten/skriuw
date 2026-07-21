import { memo, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  activateNote,
  createFolder,
  createNote,
  moveNode,
  renameNode,
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
import { Tooltip } from "../shared/ui/tooltip";
import type { RendererState, RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

type ContextTarget = { kind: "root" } | { kind: "item"; id: string };

const headerActionClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground";

const rowBaseClass =
  "relative flex h-[34px] w-full items-center overflow-hidden border border-transparent text-left text-xs font-medium transition-colors active:scale-[0.985]";

function rowIndentStyle(depth: number): CSSProperties {
  return {
    paddingLeft: `${12 + depth * 16}px`,
    paddingRight: "10px",
    "--tree-indent": `${12 + depth * 16}px`,
  } as CSSProperties;
}

function countDescendants(state: RendererState, id: string): number {
  const children = state.childrenByParent.get(id) ?? [];
  let total = children.length;
  for (const childId of children) {
    total += countDescendants(state, childId);
  }
  return total;
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
  const compactSidebar = useRendererSelector(
    store,
    (state) => state.settings.compactSidebar === true,
  );
  const showTreeGuides = useRendererSelector(
    store,
    (state) => state.settings["showTreeGuides"] === true,
  );
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
    <aside
      className={`flex h-full min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground${compactSidebar ? " sidebar-compact" : ""}${showTreeGuides ? " sidebar-guides" : ""}`}
    >
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div className="relative flex h-11 items-center justify-between overflow-hidden px-3">
          <div className="flex w-full min-w-0 items-center gap-2 md:gap-2.5">
            <Tooltip label="New note" side="bottom">
              <button
                type="button"
                className={headerActionClass}
                aria-label="New note"
                onClick={() => createNote(store, null)}
              >
                <NewNoteIcon size={18} />
              </button>
            </Tooltip>
            <Tooltip label="New folder" side="bottom">
              <button
                type="button"
                className={headerActionClass}
                aria-label="New folder"
                onClick={() => createFolder(store, null)}
              >
                <NewFolderIcon size={18} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <ContextMenu onOpenChange={(open) => !open && setContextTarget(null)}>
        <ContextMenuTrigger asChild>
          <ul
            className="m-0 min-h-0 flex-1 list-none space-y-px overflow-y-auto px-1.5 pb-4 pt-3"
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
  const descendantCount = useRendererSelector(store, (state) => countDescendants(state, id));
  if (!node) {
    return null;
  }
  const isFolder = node.kind === "folder";
  const stateClass = isFocused
    ? "bg-foreground/[0.22] text-foreground"
    : isActive
      ? "border-border bg-muted text-foreground"
      : isFolder
        ? "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88"
        : "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground/85";
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
        <div
          className={`relative flex h-[34px] w-full items-center overflow-hidden border border-border bg-muted text-left text-xs font-medium text-foreground${isFolder ? " justify-between" : ""}`}
          style={rowIndentStyle(node.depth)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {isFolder &&
              (isExpanded ? (
                <FolderOpenIcon size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground/70" />
              ) : (
                <FolderIcon size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground/70" />
              ))}
            <span className="flex h-[18px] min-w-0 flex-1 items-center">
              <RenameInput store={store} id={id} initialTitle={node.title} />
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={`${rowBaseClass} ${isFolder ? "justify-between " : ""}${stateClass}`}
          style={rowIndentStyle(node.depth)}
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
          <span className="flex min-w-0 items-center gap-1.5">
            {isFolder &&
              (isExpanded ? (
                <FolderOpenIcon size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground/70" />
              ) : (
                <FolderIcon size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground/70" />
              ))}
            <span className="flex h-[18px] min-w-0 flex-1 items-center">
              <span className="select-none truncate text-left">{node.title}</span>
            </span>
          </span>
          {isFolder && (
            <span className="ml-1.5 w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">
              {descendantCount}
            </span>
          )}
        </button>
      )}
    </li>
  );
});

type RenameProps = {
  store: RendererStore;
  id: string;
  initialTitle: string;
};

function RenameInput({ store, id, initialTitle }: RenameProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(0, 0);
  }, []);
  return (
    <input
      ref={inputRef}
      className="m-0 h-[18px] w-full border-none bg-transparent p-0 text-xs font-medium text-foreground caret-foreground outline-none selection:bg-primary/30"
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
