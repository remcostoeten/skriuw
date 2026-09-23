import { SavedSearchList } from "./saved-search-list";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  activateNote,
  createFolder,
  createNote,
  moveNode,
  moveNodes,
  restoreSubtree,
  setAllFoldersExpanded,
  setNodePinned,
  trashSubtrees,
} from "@/store/actions/workspace";
import { openBeside, openNoteInTab } from "@/store/actions/panes";
import { exportNoteAsMarkdown } from "@/features/transfer/export/markdown-transfer";
import {
  FOLDER_STRUCTURE_DEPTHS,
  formatFolderStructure,
  type FolderStructureFormat,
} from "@/features/transfer/export/folder-structure";
import { canShareNotes, shareNoteAsText } from "@/features/transfer/export/share-note";
import { haptic } from "@/shared/lib/haptics";
import { swallowGhostClick } from "@/shared/lib/ghost-click";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import {
  LONG_PRESS_MS,
  beginRowGesture,
  moveRowGesture,
  releaseIsTap,
  swipeDeletes,
  type RowGesture,
} from "./touch-gestures";
import { showToast } from "@/shared/ui/toast";
import { requestTemplatePicker } from "@/features/templates/template-picker-controller";
import { toggleNodeLock } from "@/features/lock/lock-session";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import {
  CloseIcon,
  CommandIcon,
  CopyIcon,
  DownloadIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderInputIcon,
  FolderPlusIcon,
  FoldVerticalIcon,
  PanelRightIcon,
  PencilIcon,
  PinIcon,
  LockIcon,
  LockOpenIcon,
  PinOffIcon,
  SearchIcon,
  ShareIcon,
  Trash2Icon,
  UnfoldVerticalIcon,
} from "@/shared/icons/static";
import { AppIcon } from "@/shared/icons/app-icon";
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
} from "@/shared/ui/context-menu";
import { Tooltip } from "@/shared/ui/tooltip";
import { useShortcutHints } from "@/commands/hints";
import {
  ancestorIds,
  flattenVisible,
  pinnedNodeIds,
  selectedTreeRoots,
  virtualTreeWindow,
  visualTreeIndent,
} from "@skriuw/renderer-core/store/tree";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  DRAG_THRESHOLD_PX,
  HOVER_EXPAND_DELAY_MS,
  autoScrollStep,
  dragRoots,
  dropMoves,
  dropZoneForOffset,
  indicatorIndentDepth,
  isValidDrop,
  moveCargoVanished,
  moveDropTarget,
  rowIndexAt,
  sameDropTarget,
} from "./sidebar-dnd";
import type { DropTarget } from "./sidebar-dnd";
import { noop } from "@skriuw/shared/helpers/noop";
import { SidebarCalendar } from "@/features/journal/sidebar-calendar";
import { nextFolderExpansion } from "./sidebar-search";
import { PinnedChips } from "./pinned-chips";
import { SidebarRow } from "./sidebar-row";
import { SidebarSearchResults } from "./sidebar-search-results";

type Props = {
  store: RendererStore;
  onOpenCommandPalette: () => void;
};

type ContextTarget = { kind: "root" } | { kind: "item"; id: string };

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  sourceId: string;
  active: boolean;
  dragIds: string[];
  target: DropTarget | null;
  keyListener: ((event: KeyboardEvent) => void) | null;
};

export type TreeMetrics = {
  isNarrow: boolean;
  isVeryNarrow: boolean;
  basePadding: number;
  depthIndent: number;
  rightPadding: number;
};

const NARROW_WIDTH_PX = 220;
const VERY_NARROW_WIDTH_PX = 176;
const TREE_OVERSCAN_ROWS = 3;
const MAX_RENDERED_TREE_ROWS = 80;

const headerActionBaseClass =
  "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-accent focus-visible:text-foreground";

function selectVisibleIds(state: RendererState) {
  return state.visibleIds;
}

function selectPinnedIds(state: RendererState) {
  return pinnedNodeIds([...state.sourceNodes.values()]);
}

function sameIdList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function selectCompactSidebar(state: RendererState) {
  return state.settings.compactSidebar === true;
}

function selectShowTreeGuides(state: RendererState) {
  return state.settings["showTreeGuides"] === true;
}

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

const HEADER_SHORTCUT_IDS = ["createNote", "createFolder", "toggleCommandPalette"] as const;

const SWAP_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
const REDUCED_SWAP_TRANSITION = { duration: 0.1, ease: "linear" } as const;

export function Sidebar({ store, onOpenCommandPalette }: Props) {
  const visibleIds = useRendererSelector(store, selectVisibleIds);
  const pinnedIds = useRendererSelector(store, selectPinnedIds, sameIdList);
  const compactSidebar = useRendererSelector(store, selectCompactSidebar);
  const showTreeGuides = useRendererSelector(store, selectShowTreeGuides);
  const shortcutHints = useShortcutHints(store, HEADER_SHORTCUT_IDS);
  const reduceMotion = useReducedMotion();
  const searchSwapTransition = reduceMotion ? REDUCED_SWAP_TRANSITION : SWAP_TRANSITION;
  // A single shared context menu serves every row. Rows carry `data-row-key`;
  // right-clicking the list resolves the row under the cursor and points the
  // one menu at it, instead of mounting a Radix ContextMenu per row.
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const savedSearchesRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [metrics, setMetrics] = useState(() => treeMetrics(null));
  const [treeScrollRow, setTreeScrollRow] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(0);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [moveIds, setMoveIds] = useState<readonly string[] | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const hoverExpandRef = useRef<number | null>(null);
  const autoScrollRef = useRef<{ raf: number; pointerX: number; pointerY: number } | null>(null);
  const suppressClickRef = useRef(false);
  const asideRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const touchGestureRef = useRef<RowGesture>({ kind: "idle" });
  const longPressRef = useRef<number | null>(null);
  const touchMenuRef = useRef(false);
  const touchRows = useMediaQuery("(pointer: coarse)");
  const effectiveCompact = compactSidebar || metrics.isNarrow;
  const rowHeight = touchRows ? 44 : effectiveCompact ? 28 : 34;

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
    function revealFocusedNode() {
      const element = treeRef.current;
      const state = store.getState();
      const focusedId = state.focusedNodeId;
      const index = focusedId ? state.visibleIds.indexOf(focusedId) : -1;
      element?.removeAttribute("aria-activedescendant");
      if (!element || index < 0 || focusedId === null) {
        return;
      }
      const rowPitch = rowHeight + 1;
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
        setTreeScrollRow(Math.floor(nextScrollTop / rowPitch));
      }
    }
    revealFocusedNode();
    return store.subscribe((state) => state.focusedNodeId, revealFocusedNode);
  }, [rowHeight, isSearchOpen, store]);

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
  const rowPitch = rowHeight + 1;
  const treeWindow = useMemo(
    () =>
      virtualTreeWindow(
        visibleIds.length,
        treeScrollRow * rowPitch,
        Math.max(rowPitch, treeViewportHeight),
        rowPitch,
        TREE_OVERSCAN_ROWS,
        MAX_RENDERED_TREE_ROWS,
      ),
    [rowPitch, treeScrollRow, treeViewportHeight, visibleIds.length],
  );
  const renderedIds = visibleIds.slice(treeWindow.start, treeWindow.end);
  const treeTabStopId = visibleIds[0] ?? null;
  const trimmedQuery = searchQuery.trim();
  const moveActive = moveIds !== null;
  const movingSet = useMemo(() => (moveIds ? new Set(moveIds) : null), [moveIds]);
  const selectMoveFocusId = useMemo(
    () => (state: RendererState) => (moveActive ? state.focusedNodeId : null),
    [moveActive],
  );
  const moveFocusId = useRendererSelector(store, selectMoveFocusId);
  const moveTarget = moveActive ? moveDropTarget(store.getState().nodes, moveFocusId) : null;
  const moveTargetLabel =
    moveTarget === null
      ? null
      : moveTarget.kind === "root-gap"
        ? "Top level"
        : (store.getState().nodes.get(moveTarget.id)?.title ?? "folder");

  useEffect(() => {
    if (moveIds && moveCargoVanished(store.getState().nodes, moveIds)) {
      setMoveIds(null);
    }
  }, [moveIds, store, visibleIds]);

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
        searchResultsRef.current?.contains(next) === true ||
        savedSearchesRef.current?.contains(next) === true);
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

  function focusTreeItem(id: string | null, attempts = 0): void {
    if (!id) {
      return;
    }
    requestAnimationFrame(() => {
      const item = treeRef.current?.querySelector<HTMLButtonElement>(
        `[data-row-key="${CSS.escape(id)}"]`,
      );
      if (item) {
        item.focus();
      } else if (attempts === 0) {
        focusTreeItem(id, 1);
      }
    });
  }

  function focusTreeAfterSearch(): void {
    focusTreeItem(store.getState().focusedNodeId);
  }

  function onPinnedSelect(id: string): void {
    const node = store.getState().nodes.get(id);
    if (!node) {
      return;
    }
    revealSearchResult(id);
    if (node.kind === "folder") {
      if (!store.getState().expandedIds.has(id)) {
        store.toggleExpanded(id);
      }
    } else {
      activateNote(store, id);
    }
    focusTreeItem(id);
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

  function clearHoverExpand(): void {
    if (hoverExpandRef.current !== null) {
      window.clearTimeout(hoverExpandRef.current);
      hoverExpandRef.current = null;
    }
  }

  function stopAutoScroll(): void {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current.raf);
      autoScrollRef.current = null;
    }
  }

  function scheduleHoverExpand(target: DropTarget | null): void {
    clearHoverExpand();
    if (target?.kind !== "row" || target.zone !== "inside") {
      return;
    }
    const state = store.getState();
    const node = state.nodes.get(target.id);
    if (node?.kind !== "folder" || state.expandedIds.has(target.id)) {
      return;
    }
    hoverExpandRef.current = window.setTimeout(() => {
      hoverExpandRef.current = null;
      if (dragRef.current?.active === true && !store.getState().expandedIds.has(target.id)) {
        store.toggleExpanded(target.id);
      }
    }, HOVER_EXPAND_DELAY_MS);
  }

  function setDropTargetIfChanged(next: DropTarget | null): void {
    const session = dragRef.current;
    if (!session || sameDropTarget(session.target, next)) {
      return;
    }
    session.target = next;
    setDropTarget(next);
    scheduleHoverExpand(next);
  }

  function updateDropTarget(clientX: number, clientY: number): void {
    const session = dragRef.current;
    const element = treeRef.current;
    if (session?.active !== true || !element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) {
      setDropTargetIfChanged(null);
      return;
    }
    const state = store.getState();
    const contentY = clientY - rect.top + element.scrollTop;
    const index = rowIndexAt(contentY, rowPitch, state.visibleIds.length);
    let next: DropTarget | null = null;
    if (index === "root-gap") {
      next = { kind: "root-gap" };
    } else if (index !== null) {
      const id = state.visibleIds[index];
      const node = id === undefined ? undefined : state.nodes.get(id);
      if (id !== undefined && node) {
        const zone = dropZoneForOffset(
          contentY - index * rowPitch,
          rowPitch,
          node.kind === "folder",
        );
        next = { kind: "row", id, zone };
      }
    }
    if (next && !isValidDrop(state.nodes, session.dragIds, next)) {
      next = null;
    }
    setDropTargetIfChanged(next);
  }

  function updateAutoScroll(clientX: number, clientY: number): void {
    const element = treeRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const step = autoScrollStep(
      clientY,
      rect.top,
      rect.bottom,
      AUTO_SCROLL_EDGE_PX,
      AUTO_SCROLL_MAX_STEP_PX,
    );
    if (step === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollRef.current !== null) {
      autoScrollRef.current.pointerX = clientX;
      autoScrollRef.current.pointerY = clientY;
      return;
    }
    function tick() {
      const current = autoScrollRef.current;
      const tree = treeRef.current;
      if (!current || !tree || dragRef.current?.active !== true) {
        stopAutoScroll();
        return;
      }
      const bounds = tree.getBoundingClientRect();
      const frameStep = autoScrollStep(
        current.pointerY,
        bounds.top,
        bounds.bottom,
        AUTO_SCROLL_EDGE_PX,
        AUTO_SCROLL_MAX_STEP_PX,
      );
      if (frameStep === 0) {
        stopAutoScroll();
        return;
      }
      tree.scrollTop += frameStep;
      updateDropTarget(current.pointerX, current.pointerY);
      current.raf = requestAnimationFrame(tick);
    }
    autoScrollRef.current = {
      raf: requestAnimationFrame(tick),
      pointerX: clientX,
      pointerY: clientY,
    };
  }

  function beginDrag(session: DragSession): void {
    const state = store.getState();
    const selected = state.selectedNodeIds.has(session.sourceId)
      ? state.nodeOrder.filter((id) => state.selectedNodeIds.has(id))
      : [session.sourceId];
    session.dragIds = dragRoots(selected, state.nodes);
    session.active = true;
    session.keyListener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        endDrag(false);
      }
    };
    window.addEventListener("keydown", session.keyListener, true);
    try {
      treeRef.current?.setPointerCapture(session.pointerId);
    } catch {
      // WebKitGTK can refuse capture for a pointer that already left the
      // window; the drag still works from container-level events.
      noop();
    }
    treeRef.current?.classList.add("sidebar-tree-dragging");
  }

  function endDrag(commit: boolean): void {
    const session = dragRef.current;
    dragRef.current = null;
    clearHoverExpand();
    stopAutoScroll();
    if (!session?.active) {
      return;
    }
    if (session.keyListener) {
      window.removeEventListener("keydown", session.keyListener, true);
    }
    const tree = treeRef.current;
    tree?.classList.remove("sidebar-tree-dragging");
    if (tree?.hasPointerCapture(session.pointerId) === true) {
      tree.releasePointerCapture(session.pointerId);
    }
    suppressClickRef.current = true;
    setDropTarget(null);
    if (commit && session.target !== null) {
      moveNodes(store, dropMoves(store.getState().nodes, session.dragIds, session.target));
    }
  }

  function rowElementFor(id: string): HTMLElement | null {
    return treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${id}"]`) ?? null;
  }

  function clearLongPress(): void {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function settleSwipedRow(id: string): void {
    const rowEl = rowElementFor(id);
    if (!rowEl) {
      return;
    }
    rowEl.classList.add("sidebar-tree-row-settle");
    rowEl.style.transform = "";
    delete rowEl.dataset.swipe;
    window.setTimeout(() => rowEl.classList.remove("sidebar-tree-row-settle"), 200);
  }

  // A held finger opens the same menu a right click does. Android already
  // synthesises `contextmenu` on a long press; iOS never does, so the timer
  // dispatches the event itself and the native path cancels the timer.
  function beginTouchGesture(id: string, rowEl: HTMLElement, x: number, y: number): void {
    clearLongPress();
    touchGestureRef.current = beginRowGesture(id, x, y);
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null;
      if (touchGestureRef.current.kind !== "pending") {
        return;
      }
      touchGestureRef.current = { kind: "cancelled" };
      suppressClickRef.current = true;
      touchMenuRef.current = true;
      haptic("select");
      rowEl.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
      );
    }, LONG_PRESS_MS);
  }

  function moveTouchGesture(x: number, y: number): void {
    const previous = touchGestureRef.current;
    const next = moveRowGesture(previous, x, y);
    touchGestureRef.current = next;
    if (next === previous) {
      return;
    }
    if (next.kind !== "pending") {
      clearLongPress();
    }
    if (next.kind === "swipe") {
      const rowEl = rowElementFor(next.rowId);
      if (rowEl) {
        rowEl.style.transform = `translateX(${next.offset}px)`;
        const deletes = swipeDeletes(next);
        if (deletes && rowEl.dataset.swipe !== "delete") {
          haptic("warn");
        }
        rowEl.dataset.swipe = deletes ? "delete" : "true";
      }
    }
  }

  function endTouchGesture(commit: boolean): void {
    clearLongPress();
    const gesture = touchGestureRef.current;
    touchGestureRef.current = { kind: "idle" };
    if (gesture.kind === "swipe") {
      suppressClickRef.current = true;
      settleSwipedRow(gesture.rowId);
      if (commit && swipeDeletes(gesture)) {
        haptic("confirm");
        trashSelectedNodes(gesture.rowId);
      }
      return;
    }
    if (!releaseIsTap(gesture) && gesture.kind !== "idle") {
      suppressClickRef.current = gesture.kind === "cancelled" && suppressClickRef.current;
    }
  }

  function onTreePointerDown(event: React.PointerEvent): void {
    if (dragRef.current !== null) {
      endDrag(false);
    }
    if (event.button !== 0) {
      return;
    }
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
    const id = rowEl?.getAttribute("data-row-key");
    if (!id || !rowEl) {
      return;
    }
    // Touch owns different gestures: a hold opens the menu (which carries
    // Move to) and a pull toward the edge deletes, so reordering by drag is a
    // pointer-only affordance.
    if (event.pointerType === "touch") {
      beginTouchGesture(id, rowEl, event.clientX, event.clientY);
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceId: id,
      active: false,
      dragIds: [],
      target: null,
      keyListener: null,
    };
  }

  function onTreePointerMove(event: React.PointerEvent): void {
    if (event.pointerType === "touch") {
      moveTouchGesture(event.clientX, event.clientY);
      return;
    }
    const session = dragRef.current;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    if (!session.active) {
      const deltaX = event.clientX - session.startX;
      const deltaY = event.clientY - session.startY;
      if (deltaX * deltaX + deltaY * deltaY < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        return;
      }
      beginDrag(session);
    }
    updateDropTarget(event.clientX, event.clientY);
    updateAutoScroll(event.clientX, event.clientY);
  }

  function onTreePointerUp(event: React.PointerEvent): void {
    if (event.pointerType === "touch") {
      endTouchGesture(true);
      return;
    }
    const session = dragRef.current;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    endDrag(true);
  }

  function onTreePointerCancel(event: React.PointerEvent): void {
    if (event.pointerType === "touch") {
      endTouchGesture(false);
      return;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      endDrag(false);
    }
  }

  function onTreeClickCapture(event: React.MouseEvent): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function renderDropIndicator() {
    if (dropTarget === null) {
      return null;
    }
    const nodes = store.getState().nodes;
    const targetIndex =
      dropTarget.kind === "row" ? visibleIds.indexOf(dropTarget.id) : visibleIds.length;
    if (targetIndex < 0) {
      return null;
    }
    if (dropTarget.kind === "row" && dropTarget.zone === "inside") {
      return (
        <div
          className="tree-drop-inside"
          style={{ top: `${targetIndex * rowPitch}px`, height: `${rowPitch - 1}px` }}
        />
      );
    }
    const depth = indicatorIndentDepth(nodes, dropTarget);
    const maximumIndent = metrics.isVeryNarrow ? 40 : metrics.isNarrow ? 56 : 80;
    const indent = visualTreeIndent(depth, metrics.basePadding, metrics.depthIndent, maximumIndent);
    const rowOffset =
      dropTarget.kind === "row" && dropTarget.zone === "before" ? targetIndex : targetIndex + 1;
    const lineRow = dropTarget.kind === "root-gap" ? visibleIds.length : rowOffset;
    return (
      <div
        className="tree-drop-line"
        style={{ top: `${lineRow * rowPitch - 1}px`, left: `${indent}px` }}
      />
    );
  }

  useEffect(() => () => endDrag(false), []);

  function openRowContextMenu(id: string): void {
    const rowEl = treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(id)}"]`);
    if (!rowEl) {
      return;
    }
    const rect = rowEl.getBoundingClientRect();
    rowEl.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 24,
        clientY: rect.bottom,
      }),
    );
  }

  function onTreeKeyDown(event: React.KeyboardEvent): void {
    const state = store.getState();
    const focusedId = state.focusedNodeId;
    if (state.editingNodeId !== null) {
      return;
    }
    const focusIndex = focusedId ? state.visibleIds.indexOf(focusedId) : -1;
    const focused = focusedId ? state.nodes.get(focusedId) : undefined;
    // Move mode: arrows steer a destination cursor, Enter/Space/M drops the
    // cargo into the focused folder (or a note's parent), Esc cancels. Every
    // other key is swallowed while relocating.
    if (moveIds !== null) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoveIds(null);
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "m" || event.key === "M") {
        event.preventDefault();
        const cargo = moveIds.filter((id) => state.nodes.has(id));
        const moves = dropMoves(state.nodes, cargo, moveDropTarget(state.nodes, focusedId));
        if (moves.length > 0) {
          moveNodes(store, moves);
          setMoveIds(null);
        }
        return;
      }
      const isPlainArrow =
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      if (!isPlainArrow) {
        return;
      }
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "Enter")) {
      event.preventDefault();
      if (focusedId) {
        openRowContextMenu(focusedId);
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
      setIsSearchOpen(true);
      searchInputRef.current?.focus();
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
          if (event.shiftKey) {
            store.selectTreeNode(next, "range");
          }
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
          setMoveIds(cargo);
          event.preventDefault();
        }
        return;
      }
      case "Delete": {
        if (focusedId) {
          trashSelectedNodes(focusedId);
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

  function closeContextMenu(element: HTMLElement): void {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  function itemMenuActions(id: string): Record<string, () => void> {
    const state = store.getState();
    const node = state.nodes.get(id);
    const actions: Record<string, () => void> = { d: () => trashSelectedNodes(id) };
    if (!node || state.selectedNodeIds.size > 1) {
      return actions;
    }
    const isPinned = (state.sourceNodes.get(id)?.pinnedAt ?? null) !== null;
    Object.assign(actions, {
      r: () => store.setEditingNode(id),
      p: () => setNodePinned(store, id, !isPinned),
      l: () => toggleNodeLock(store, id),
      m: () => setMoveIds(selectedRootsFor(id)),
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
      });
    }
    return actions;
  }

  function rootMenuActions(): Record<string, () => void> {
    return {
      n: () => createNote(store, null),
      t: () => requestTemplatePicker(null),
      f: () => createFolder(store, null),
      e: () => setAllFoldersExpanded(store, true),
      c: () => setAllFoldersExpanded(store, false),
    };
  }

  function onContextMenuKeyDown(
    event: React.KeyboardEvent,
    actions: Record<string, () => void>,
  ): void {
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

  function selectedRootsFor(id: string): string[] {
    const state = store.getState();
    if (!state.selectedNodeIds.has(id)) {
      return [id];
    }
    return selectedTreeRoots(state.selectedNodeIds, state.nodes);
  }

  function trashSelectedNodes(id: string): void {
    const roots = selectedRootsFor(id);
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

  function onListContextMenu(event: React.MouseEvent): void {
    clearLongPress();
    touchGestureRef.current = { kind: "idle" };
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
    const id = rowEl?.getAttribute("data-row-key") ?? null;
    if (id === null) {
      setContextTarget({ kind: "root" });
      return;
    }
    if (!store.getState().selectedNodeIds.has(id)) {
      store.selectTreeNode(id, "replace");
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
          <ContextMenuShortcut keys="M" />
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
          <ContextMenuShortcut keys="N" />
        </ContextMenuItem>
        <ContextMenuItem onClick={() => requestTemplatePicker(null)} className="gap-2">
          <FileTextIcon className="w-4 h-4" />
          New note from template…
          <ContextMenuShortcut keys="T" />
        </ContextMenuItem>
        <ContextMenuItem onClick={() => createFolder(store, null)} className="gap-2">
          <FolderPlusIcon className="w-4 h-4" />
          New folder
          <ContextMenuShortcut keys="F" />
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setAllFoldersExpanded(store, true)} className="gap-2">
          <UnfoldVerticalIcon size={14} className="h-3.5 w-3.5" />
          Expand all folders
          <ContextMenuShortcut keys="E" />
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setAllFoldersExpanded(store, false)} className="gap-2">
          <FoldVerticalIcon size={14} className="h-3.5 w-3.5" />
          Collapse all folders
          <ContextMenuShortcut keys="C" />
        </ContextMenuItem>
      </>
    );
  }

  function copyFolderStructure(
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

  function renderCopyStructureSubmenu(id: string) {
    const formats: { format: FolderStructureFormat; label: string }[] = [
      { format: "json", label: "As JSON" },
      { format: "tree", label: "As file tree" },
    ];
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger className="gap-2">
          <CopyIcon className="w-4 h-4" />
          Copy structure
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {formats.map(({ format, label }) => (
            <ContextMenuSub key={format}>
              <ContextMenuSubTrigger>{label}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-36">
                {FOLDER_STRUCTURE_DEPTHS.map((depth) => (
                  <ContextMenuItem
                    key={depth ?? "all"}
                    onClick={() => copyFolderStructure(id, format, depth)}
                  >
                    {depth === null ? "All levels" : `${depth} level${depth === 1 ? "" : "s"} deep`}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }

  function renderItemContextItems(id: string) {
    const node = store.getState().nodes.get(id);
    if (!node) {
      return null;
    }
    const isBulkSelection = store.getState().selectedNodeIds.size > 1;
    const isPinned = (store.getState().sourceNodes.get(id)?.pinnedAt ?? null) !== null;
    const isLocked = (store.getState().sourceNodes.get(id)?.lockedAt ?? null) !== null;
    return (
      <>
        {!isBulkSelection && (
          <>
            <ContextMenuItem onClick={() => store.setEditingNode(id)} className="gap-2">
              <PencilIcon className="w-4 h-4" />
              Rename
              <ContextMenuShortcut keys="R" />
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setNodePinned(store, id, !isPinned)} className="gap-2">
              {isPinned ? <PinOffIcon className="w-4 h-4" /> : <PinIcon className="w-4 h-4" />}
              {isPinned ? "Unpin" : "Pin"}
              <ContextMenuShortcut keys="P" />
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toggleNodeLock(store, id)} className="gap-2">
              {isLocked ? <LockOpenIcon className="w-4 h-4" /> : <LockIcon className="w-4 h-4" />}
              {isLocked
                ? node.kind === "folder"
                  ? "Unlock folder"
                  : "Unlock note"
                : node.kind === "folder"
                  ? "Lock folder…"
                  : "Lock note…"}
              <ContextMenuShortcut keys="L" />
            </ContextMenuItem>
            {node.kind === "folder" && (
              <>
                <ContextMenuItem onClick={() => createNote(store, id)} className="gap-2">
                  <FilePlusIcon className="w-4 h-4" />
                  New note inside
                  <ContextMenuShortcut keys="N" />
                </ContextMenuItem>
                <ContextMenuItem onClick={() => requestTemplatePicker(id)} className="gap-2">
                  <FileTextIcon className="w-4 h-4" />
                  New note from template…
                  <ContextMenuShortcut keys="T" />
                </ContextMenuItem>
                <ContextMenuItem onClick={() => createFolder(store, id)} className="gap-2">
                  <FolderPlusIcon className="w-4 h-4" />
                  New folder inside
                  <ContextMenuShortcut keys="F" />
                </ContextMenuItem>
                {renderCopyStructureSubmenu(id)}
              </>
            )}
            {renderMoveToSubmenu(id, node.parentId)}
            {node.kind === "note" && (
              <>
                <ContextMenuItem onClick={() => openNoteInTab(store, id)} className="gap-2">
                  <FilePlusIcon className="w-4 h-4" />
                  Open in new tab
                  <ContextMenuShortcut keys="O" />
                </ContextMenuItem>
                <ContextMenuItem onClick={() => openBeside(store, id)} className="gap-2">
                  <PanelRightIcon className="w-4 h-4" />
                  Open beside
                  <ContextMenuShortcut keys="B" />
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => void exportNoteAsMarkdown(store, id)}
                  className="gap-2"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Export as Markdown…
                  <ContextMenuShortcut keys="E" />
                </ContextMenuItem>
                {canShareNotes() && (
                  <ContextMenuItem
                    onClick={() => {
                      void shareNoteAsText(store, id).catch((error) => {
                        console.error("note share failed", error);
                        showToast({ message: "Sharing failed. Try exporting instead." });
                      });
                    }}
                    className="gap-2"
                  >
                    <ShareIcon className="w-4 h-4" />
                    Share…
                  </ContextMenuItem>
                )}
              </>
            )}
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onClick={() => trashSelectedNodes(id)}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2Icon className="w-4 h-4" />
          {isBulkSelection ? "Delete selected" : "Delete"}
          <ContextMenuShortcut keys="D" />
          <ContextMenuShortcut keys="⌫" className="ml-0 pl-[3px]" />
        </ContextMenuItem>
      </>
    );
  }

  return (
    <aside
      ref={asideRef}
      className={`flex h-full min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground${effectiveCompact ? " sidebar-compact" : ""}${touchRows ? " sidebar-touch" : ""}${showTreeGuides ? " sidebar-guides" : ""}`}
    >
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div
          className={`relative flex h-11 items-center justify-between overflow-hidden ${metrics.isNarrow ? "px-1.5" : "px-3"}`}
        >
          <motion.div
            animate={
              isSearchOpen ? { y: -8, opacity: 0, scale: 0.985 } : { y: 0, opacity: 1, scale: 1 }
            }
            transition={searchSwapTransition}
            inert={isSearchOpen}
            aria-hidden={isSearchOpen}
            className={`flex w-full min-w-0 items-center justify-between will-change-transform${isSearchOpen ? " pointer-events-none" : ""}`}
          >
            <Tooltip label="New note" side="bottom" shortcut={shortcutHints.createNote}>
              <button
                type="button"
                className={headerActionClass}
                aria-label="New note"
                onClick={() => createNote(store, null)}
              >
                <AppIcon name="new-note" size={18} />
              </button>
            </Tooltip>
            <Tooltip label="New folder" side="bottom" shortcut={shortcutHints.createFolder}>
              <button
                type="button"
                className={headerActionClass}
                aria-label="New folder"
                onClick={() => createFolder(store, null)}
              >
                <FolderPlusIcon size={18} />
              </button>
            </Tooltip>
            <Tooltip label="Toggle all folders" side="bottom">
              <button
                type="button"
                className={headerActionClass}
                aria-label="Toggle all folders"
                onClick={() => toggleAllFolders(store)}
              >
                <UnfoldVerticalIcon size={16} />
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
                <SearchIcon size={16} />
              </button>
            </Tooltip>
            <Tooltip
              label="Command menu"
              side="bottom"
              shortcut={shortcutHints.toggleCommandPalette}
            >
              <button
                type="button"
                className={headerActionClass}
                aria-label="Command menu"
                onClick={onOpenCommandPalette}
              >
                <CommandIcon size={16} />
              </button>
            </Tooltip>
          </motion.div>
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                ref={searchOverlayRef}
                initial={{ y: 8, opacity: 0, scale: 0.985 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 8, opacity: 0, scale: 0.985 }}
                transition={searchSwapTransition}
                className="absolute inset-x-0 top-0 flex h-11 items-center px-3 will-change-transform"
                onBlur={onSearchAreaBlur}
              >
                <div className="flex h-8 w-full items-center gap-2 bg-transparent px-2.5">
                  <SearchIcon size={14} className="shrink-0 text-muted-foreground" />
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
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-accent focus-visible:text-foreground"
                    aria-label="Close search"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div ref={savedSearchesRef} onBlur={onSearchAreaBlur} className="shrink-0">
        <SavedSearchList
          store={store}
          query={trimmedQuery}
          onSelect={(query) => {
            setSearchQuery(query);
            setIsSearchOpen(true);
          }}
        />
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
        <ContextMenu
          onOpenChange={(open) => {
            if (open) {
              return;
            }
            setContextTarget(null);
            if (touchMenuRef.current) {
              touchMenuRef.current = false;
              swallowGhostClick();
            }
          }}
        >
          {moveIds !== null && (
            <div className="mx-1.5 mb-1 flex items-center gap-2 border border-foreground/20 bg-foreground/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-foreground">
              <FolderInputIcon size={14} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">
                Moving {moveIds.length} item{moveIds.length > 1 ? "s" : ""} →{" "}
                <span className="text-foreground">{moveTargetLabel}</span>
              </span>
              <span className="ml-auto shrink-0 text-muted-foreground">↵ drop · esc cancel</span>
            </div>
          )}
          <ContextMenuTrigger asChild>
            <div className="flex min-h-0 flex-1 flex-col" onContextMenu={onListContextMenu}>
              {pinnedIds.length > 0 && (
                <PinnedChips store={store} ids={pinnedIds} onSelect={onPinnedSelect} />
              )}
              <div
                ref={treeRef}
                className="relative min-h-0 flex-1 overflow-y-auto px-1.5"
                style={touchRows ? { touchAction: "pan-y" } : undefined}
                role="tree"
                aria-label="Workspace"
                tabIndex={-1}
                onFocus={(event) => {
                  if (event.target === event.currentTarget) {
                    focusTreeItem(store.getState().focusedNodeId ?? treeTabStopId);
                  }
                }}
                onKeyDown={onTreeKeyDown}
                onPointerDown={onTreePointerDown}
                onPointerMove={onTreePointerMove}
                onPointerUp={onTreePointerUp}
                onPointerCancel={onTreePointerCancel}
                onClickCapture={onTreeClickCapture}
                onScroll={(event) =>
                  setTreeScrollRow(Math.floor(event.currentTarget.scrollTop / rowPitch))
                }
              >
                <div className="relative w-full" style={{ height: `${treeWindow.totalHeight}px` }}>
                  {renderedIds.map((id, position) => (
                    <SidebarRow
                      key={id}
                      store={store}
                      id={id}
                      metrics={metrics}
                      top={(treeWindow.start + position) * rowPitch}
                      tabIndex={id === treeTabStopId ? 0 : -1}
                      moving={movingSet?.has(id) === true}
                    />
                  ))}
                  {renderDropIndicator()}
                </div>
              </div>
              <SidebarCalendar store={store} />
            </div>
          </ContextMenuTrigger>
          {contextTarget?.kind === "root" && (
            <ContextMenuContent
              className="w-48"
              onKeyDown={(event) => onContextMenuKeyDown(event, rootMenuActions())}
            >
              {renderRootContextItems()}
            </ContextMenuContent>
          )}
          {contextTarget?.kind === "item" && (
            <ContextMenuContent
              className="w-48"
              onKeyDown={(event) => onContextMenuKeyDown(event, itemMenuActions(contextTarget.id))}
              onCloseAutoFocus={(event) => {
                if (store.getState().editingNodeId === null) {
                  return;
                }
                // The rename field mounted while the menu's focus scope was
                // still trapping, which pulled its mount-time focus back into
                // the menu; now that the menu is gone the field can hold it.
                event.preventDefault();
                asideRef.current
                  ?.querySelector<HTMLInputElement>('input[aria-label^="Rename"]')
                  ?.focus();
              }}
            >
              {renderItemContextItems(contextTarget.id)}
            </ContextMenuContent>
          )}
        </ContextMenu>
      )}
    </aside>
  );
}
