import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  CloseIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FoldVerticalIcon,
  NewFolderIcon,
  NewNoteIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UnfoldVerticalIcon,
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
import {
  ancestorIds,
  flattenVisible,
  virtualTreeWindow,
  visualTreeIndent,
} from "../store/tree";
import type { RendererState, RendererStore } from "../store/types";
import { nextFolderExpansion, searchSidebarNodes } from "./sidebar-search";

type Props = {
  store: RendererStore;
};

type ContextTarget = { kind: "root" } | { kind: "item"; id: string };

type TreeMetrics = {
  isNarrow: boolean;
  isVeryNarrow: boolean;
  basePadding: number;
  depthIndent: number;
  rightPadding: number;
};

const NARROW_WIDTH_PX = 220;
const VERY_NARROW_WIDTH_PX = 176;
const MAX_SEARCH_RESULTS_PER_TYPE = 10;
const TREE_OVERSCAN_ROWS = 3;
const MAX_RENDERED_TREE_ROWS = 80;

const headerActionBaseClass =
  "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground";

const rowBaseClass =
  "relative flex h-[34px] w-full items-center overflow-hidden border border-transparent text-left text-xs font-medium transition-colors active:scale-[0.985]";

function treeMetrics(sidebarWidth: number | null): TreeMetrics {
  const isNarrow = sidebarWidth !== null && sidebarWidth < NARROW_WIDTH_PX;
  const isVeryNarrow = sidebarWidth !== null && sidebarWidth < VERY_NARROW_WIDTH_PX;
  return {
    isNarrow,
    isVeryNarrow,
    basePadding: isNarrow ? 8 : 12,
    depthIndent: isVeryNarrow ? 8 : isNarrow ? 12 : 16,
    rightPadding: isNarrow ? 6 : 10,
  };
}

function rowIndentStyle(depth: number, metrics: TreeMetrics): CSSProperties {
  const maximumIndent = metrics.isVeryNarrow ? 40 : metrics.isNarrow ? 56 : 80;
  const indent = visualTreeIndent(
    depth,
    metrics.basePadding,
    metrics.depthIndent,
    maximumIndent,
  );
  return {
    paddingLeft: `${indent}px`,
    paddingRight: `${metrics.rightPadding}px`,
    "--tree-indent": `${indent}px`,
    "--tree-base": `${metrics.basePadding}px`,
    "--tree-step": `${metrics.depthIndent}px`,
  } as CSSProperties;
}

function setAllFoldersExpanded(store: RendererStore, expanded: boolean): void {
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

function toggleAllFolders(store: RendererStore): void {
  const state = store.getState();
  const expandedIds = nextFolderExpansion(state.nodes, state.expandedIds);
  store.update((current) => ({
    ...current,
    expandedIds,
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [metrics, setMetrics] = useState(() => treeMetrics(null));
  const [treeScrollTop, setTreeScrollTop] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(0);
  const asideRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const effectiveCompact = compactSidebar || metrics.isNarrow;

  useEffect(() => {
    const element = asideRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined) {
        return;
      }
      setMetrics((previous) => {
        const next = treeMetrics(width);
        return next.isNarrow === previous.isNarrow && next.isVeryNarrow === previous.isVeryNarrow
          ? previous
          : next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const revealFocusedNode = () => {
      const element = treeRef.current;
      const state = store.getState();
      const focusedId = state.focusedNodeId;
      const index = focusedId ? state.visibleIds.indexOf(focusedId) : -1;
      element?.removeAttribute("aria-activedescendant");
      if (!element || index < 0 || focusedId === null) {
        return;
      }
      const rowPitch = (effectiveCompact ? 28 : 34) + 1;
      const top = index * rowPitch;
      const bottom = top + rowPitch;
      let nextScrollTop = element.scrollTop;
      if (top < element.scrollTop) {
        nextScrollTop = top;
      } else if (bottom > element.scrollTop + element.clientHeight) {
        nextScrollTop = bottom - element.clientHeight;
      }
      if (nextScrollTop !== element.scrollTop) {
        element.scrollTop = nextScrollTop;
        setTreeScrollTop(nextScrollTop);
      }
    };
    revealFocusedNode();
    return store.subscribe((state) => state.focusedNodeId, revealFocusedNode);
  }, [effectiveCompact, isSearchOpen, store]);

  useEffect(() => {
    const element = treeRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height !== undefined) {
        setTreeViewportHeight(height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isSearchOpen]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const headerActionClass = `${headerActionBaseClass} ${metrics.isNarrow ? "h-6 w-6" : "h-7 w-7"}`;
  const rowPitch = (effectiveCompact ? 28 : 34) + 1;
  const treeWindow = useMemo(
    () =>
      virtualTreeWindow(
        visibleIds.length,
        treeScrollTop,
        Math.max(rowPitch, treeViewportHeight),
        rowPitch,
        TREE_OVERSCAN_ROWS,
        MAX_RENDERED_TREE_ROWS,
      ),
    [rowPitch, treeScrollTop, treeViewportHeight, visibleIds.length],
  );
  const renderedIds = visibleIds.slice(treeWindow.start, treeWindow.end);
  const treeTabStopId = visibleIds[0] ?? null;
  const trimmedQuery = searchQuery.trim();

  function closeSearch(restoreTrigger = false): void {
    setIsSearchOpen(false);
    setSearchQuery("");
    if (restoreTrigger) {
      requestAnimationFrame(() => searchTriggerRef.current?.focus());
    }
  }

  function searchResultButtons(): HTMLButtonElement[] {
    return [...(searchResultsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  }

  function onSearchAreaBlur(event: React.FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const staysInside =
      next !== null &&
      (searchOverlayRef.current?.contains(next) === true ||
        searchResultsRef.current?.contains(next) === true);
    if (!staysInside) {
      closeSearch();
    }
  }

  function onSearchInputKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch(true);
      return;
    }
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      searchResultButtons()[0]?.focus();
    }
  }

  function onSearchResultsKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "/") {
      event.preventDefault();
      searchInputRef.current?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch(true);
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const buttons = searchResultButtons();
    if (buttons.length === 0) {
      return;
    }
    if (event.key === "Home") {
      buttons[0]?.focus();
      return;
    }
    if (event.key === "End") {
      buttons[buttons.length - 1]?.focus();
      return;
    }
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowUp" && index <= 0) {
      searchInputRef.current?.focus();
      return;
    }
    buttons[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  }

  function revealSearchResult(id: string): void {
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

  function focusTreeItem(id: string | null): void {
    if (!id) {
      return;
    }
    requestAnimationFrame(() => {
      treeRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-key="${CSS.escape(id)}"]`)
        ?.focus();
    });
  }

  function focusTreeAfterSearch(): void {
    focusTreeItem(store.getState().focusedNodeId);
  }

  function onSearchNoteSelect(id: string): void {
    revealSearchResult(id);
    activateNote(store, id);
    closeSearch();
    focusTreeAfterSearch();
  }

  function onSearchFolderSelect(id: string): void {
    revealSearchResult(id);
    const state = store.getState();
    if (!state.expandedIds.has(id)) {
      store.toggleExpanded(id);
    }
    closeSearch();
    focusTreeAfterSearch();
  }

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
          focusTreeItem(next);
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
          focusTreeItem(next);
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
              focusTreeItem(firstChild);
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
          focusTreeItem(focused.parentId);
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
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setAllFoldersExpanded(store, true)} className="gap-2">
          <UnfoldVerticalIcon className="h-3.5 w-3.5" strokeWidth={1.6} />
          Expand all folders
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setAllFoldersExpanded(store, false)} className="gap-2">
          <FoldVerticalIcon className="h-3.5 w-3.5" strokeWidth={1.6} />
          Collapse all folders
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
      ref={asideRef}
      className={`flex h-full min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground${effectiveCompact ? " sidebar-compact" : ""}${showTreeGuides ? " sidebar-guides" : ""}`}
    >
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div
          className={`relative flex h-11 items-center justify-between overflow-hidden ${metrics.isNarrow ? "px-1.5" : "px-3"}`}
        >
          <div
            className={`flex w-full min-w-0 items-center ${metrics.isNarrow ? "gap-0.5" : "gap-2 md:gap-2.5"}`}
          >
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
            <Tooltip label="Toggle all folders" side="bottom">
              <button
                type="button"
                className={headerActionClass}
                aria-label="Toggle all folders"
                onClick={() => toggleAllFolders(store)}
              >
                <UnfoldVerticalIcon size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
            <Tooltip label="Search notes" side="bottom">
              <button
                ref={searchTriggerRef}
                type="button"
                className={headerActionClass}
                aria-label="Search notes"
                onClick={() => setIsSearchOpen(true)}
              >
                <SearchIcon size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
          </div>
          {isSearchOpen && (
            <div
              ref={searchOverlayRef}
              className="absolute inset-x-0 top-0 flex h-11 items-center bg-sidebar px-3"
              onBlur={onSearchAreaBlur}
            >
              <div className="flex h-8 w-full items-center gap-2 bg-transparent px-2.5">
                <SearchIcon
                  size={14}
                  strokeWidth={1.5}
                  className="shrink-0 text-muted-foreground"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  onKeyDown={onSearchInputKeyDown}
                  placeholder="Search"
                  aria-label="Search notes"
                  inputMode="search"
                  enterKeyHint="search"
                  className="h-full w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 focus-visible:shadow-none"
                />
                <button
                  type="button"
                  onClick={() => closeSearch(true)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground"
                  aria-label="Close search"
                >
                  <CloseIcon size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {trimmedQuery ? (
        <SidebarSearchResults
          ref={searchResultsRef}
          store={store}
          query={trimmedQuery}
          onKeyDown={onSearchResultsKeyDown}
          onBlur={onSearchAreaBlur}
          onFolderSelect={onSearchFolderSelect}
          onNoteSelect={onSearchNoteSelect}
        />
      ) : (
        <ContextMenu onOpenChange={(open) => !open && setContextTarget(null)}>
          <ContextMenuTrigger asChild>
            <div
              ref={treeRef}
              className="relative min-h-0 flex-1 overflow-y-auto px-1.5"
              role="tree"
              aria-label="Workspace"
              tabIndex={-1}
              onFocus={(event) => {
                if (event.target === event.currentTarget) {
                  focusTreeItem(store.getState().focusedNodeId ?? treeTabStopId);
                }
              }}
              onKeyDown={onTreeKeyDown}
              onContextMenu={onListContextMenu}
              onScroll={(event) => setTreeScrollTop(event.currentTarget.scrollTop)}
            >
              <div
                className="relative w-full"
                style={{ height: `${treeWindow.totalHeight}px` }}
              >
                {renderedIds.map((id, position) => (
                  <SidebarRow
                    key={id}
                    store={store}
                    id={id}
                    metrics={metrics}
                    top={(treeWindow.start + position) * rowPitch}
                    tabIndex={id === treeTabStopId ? 0 : -1}
                  />
                ))}
              </div>
            </div>
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
      )}
    </aside>
  );
}

type SearchResultsProps = {
  ref: React.Ref<HTMLDivElement>;
  store: RendererStore;
  query: string;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
  onFolderSelect: (id: string) => void;
  onNoteSelect: (id: string) => void;
};

function SidebarSearchResults({
  ref,
  store,
  query,
  onKeyDown,
  onBlur,
  onFolderSelect,
  onNoteSelect,
}: SearchResultsProps) {
  const nodes = useRendererSelector(store, (state) => state.nodes);
  const nodeOrder = useRendererSelector(store, (state) => state.nodeOrder);
  const activeNoteId = useRendererSelector(store, (state) => state.activeNoteId);
  const results = useMemo(
    () => searchSidebarNodes(nodes, nodeOrder, query, MAX_SEARCH_RESULTS_PER_TYPE),
    [nodes, nodeOrder, query],
  );
  const hasResults = results.folderTotal > 0 || results.noteTotal > 0;
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      role="region"
      aria-label="Sidebar search results"
    >
      {hasResults ? (
        <div className="flex flex-col gap-3">
          {results.folders.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Folders
              </p>
              {results.folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFolderSelect(folder.id)}
                  className="flex h-[34px] w-full items-center gap-1.5 border border-transparent px-2 text-left text-xs font-medium text-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground/88"
                >
                  <FolderIcon
                    size={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted-foreground/70"
                  />
                  <span className="truncate">{folder.title}</span>
                </button>
              ))}
              {results.folderTotal > results.folders.length && (
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                  +{results.folderTotal - results.folders.length} more folders
                </p>
              )}
            </div>
          )}
          {results.notes.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              {results.notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNoteSelect(note.id)}
                  aria-current={note.id === activeNoteId ? "page" : undefined}
                  className={`flex h-[34px] w-full items-center gap-1.5 border border-transparent px-2 text-left text-xs font-medium transition-colors ${
                    note.id === activeNoteId
                      ? "border-border bg-muted text-foreground"
                      : "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88"
                  }`}
                >
                  <FileTextIcon
                    size={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted-foreground/70"
                  />
                  <span className="truncate">{note.title}</span>
                </button>
              ))}
              {results.noteTotal > results.notes.length && (
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                  +{results.noteTotal - results.notes.length} more notes
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-2 py-6 text-center" role="status">
          <p className="text-xs font-medium text-foreground/70">No matching titles</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Try a different note or folder name.
          </p>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  store: RendererStore;
  id: string;
  metrics: TreeMetrics;
  top: number;
  tabIndex: 0 | -1;
};

const SidebarRow = memo(function SidebarRow({ store, id, metrics, top, tabIndex }: RowProps) {
  const node = useRendererSelector(store, (state) => state.nodes.get(id));
  const status = useRendererSelector(
    store,
    (state) =>
      Number(state.activeNoteId === id) |
      (Number(state.focusedNodeId === id) << 1) |
      (Number(state.expandedIds.has(id)) << 2) |
      (Number(state.editingNodeId === id) << 3),
  );
  if (!node) {
    return null;
  }
  const isActive = (status & 1) !== 0;
  const isFocused = (status & 2) !== 0;
  const isExpanded = (status & 4) !== 0;
  const isEditing = (status & 8) !== 0;
  const isFolder = node.kind === "folder";
  const rowTabIndex =
    isFocused || (tabIndex === 0 && store.getState().focusedNodeId === null) ? 0 : -1;
  const stateClass = isFocused
    ? "bg-foreground/[0.22] text-foreground"
    : isActive
      ? "border-border bg-muted text-foreground"
      : isFolder
        ? "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88"
        : "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground/85";
  return (
    <div
      className="absolute inset-x-0"
      style={{ top: `${top}px` }}
    >
      {isEditing ? (
        <div
          className={`relative flex h-[34px] w-full items-center overflow-hidden border border-border bg-muted text-left text-xs font-medium text-foreground${isFolder ? " justify-between" : ""}`}
          style={rowIndentStyle(node.depth, metrics)}
        >
          <span
            className={`flex min-w-0 flex-1 items-center ${metrics.isNarrow ? "gap-1" : "gap-1.5"}`}
          >
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
          id={`treeitem-${id}`}
          className={`${rowBaseClass} ${isFolder ? "justify-between " : ""}${stateClass}`}
          style={rowIndentStyle(node.depth, metrics)}
          role="treeitem"
          aria-level={node.depth}
          aria-setsize={node.setSize}
          aria-posinset={node.posInSet}
          aria-selected={isActive}
          {...(isFolder ? { "aria-expanded": isExpanded } : {})}
          tabIndex={rowTabIndex}
          data-row-key={id}
          onFocus={() => store.setFocusedNode(id)}
          onClick={() => {
            store.setFocusedNode(id);
            if (isFolder) {
              store.toggleExpanded(id);
            } else {
              activateNote(store, id);
            }
          }}
        >
          <span
            className={`flex min-w-0 items-center ${metrics.isNarrow ? "gap-1" : "gap-1.5"}`}
          >
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
          {isFolder && !metrics.isVeryNarrow && (
            <span className="ml-1.5 w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">
              {node.descendantCount}
            </span>
          )}
        </button>
      )}
    </div>
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
