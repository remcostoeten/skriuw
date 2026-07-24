import { ancestorIds, flattenVisible } from "./tree";
import type { TreeIndex, TreeNode } from "./types";

export const ROW_HEIGHT_PX = 28;
export const OVERSCAN_ROWS = 8;

type RenderedRowState = {
  id: string;
  title: string;
  kind: string;
  depth: number;
  setSize: number;
  posInSet: number;
  expanded: boolean | null;
  selected: boolean;
  focused: boolean;
  disabled: boolean;
  top: number;
};

export type ViewCounters = {
  hostMounts: number;
  patches: number;
  mutatedRows: number;
};

export type TreeView = {
  setTree(index: TreeIndex, expandedIds: readonly string[]): void;
  refresh(): void;
  select(id: string | null): void;
  focus(id: string | null): void;
  setDisabled(ids: readonly string[]): void;
  toggleExpanded(id: string): void;
  expandAncestors(id: string): void;
  isExpanded(id: string): boolean;
  handleKey(key: string): void;
  scrollTo(offsetPx: number): void;
  scrollToNode(id: string): void;
  selectedId(): string | null;
  focusedId(): string | null;
  visibleRows(): readonly TreeNode[];
  renderedRowIds(): string[];
  renderedRowCount(): number;
  maxRenderedRows(): number;
  counters(): ViewCounters;
  layoutHeight(): number;
  element(): HTMLElement;
  destroy(): void;
};

export function createTreeView(host: HTMLElement, label: string): TreeView {
  const viewport = document.createElement("div");
  viewport.className = "tree-viewport";
  viewport.tabIndex = -1;
  const sizer = document.createElement("div");
  sizer.className = "tree-sizer";
  sizer.setAttribute("role", "tree");
  sizer.setAttribute("aria-label", label);
  viewport.appendChild(sizer);
  host.appendChild(viewport);

  let index: TreeIndex | null = null;
  const expanded = new Set<string>();
  const disabled = new Set<string>();
  let visible: TreeNode[] = [];
  let rowIndexById = new Map<string, number>();
  let selected: string | null = null;
  let focused: string | null = null;

  const mounted = new Map<string, HTMLElement>();
  const pool: HTMLElement[] = [];
  const rowStates = new WeakMap<HTMLElement, RenderedRowState>();

  const counters: ViewCounters = {
    hostMounts: 1,
    patches: 0,
    mutatedRows: 0,
  };
  let maxRendered = 0;

  function createRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.setAttribute("role", "treeitem");
    row.tabIndex = -1;
    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    const title = document.createElement("span");
    title.className = "tree-title";
    row.append(chevron, title);
    return row;
  }

  function applyRow(row: HTMLElement, node: TreeNode, top: number): boolean {
    const next: RenderedRowState = {
      id: node.id,
      title: node.title,
      kind: node.kind,
      depth: node.depth,
      setSize: node.setSize,
      posInSet: node.posInSet,
      expanded: node.kind === "folder" ? expanded.has(node.id) : null,
      selected: selected === node.id,
      focused: focused === node.id,
      disabled: disabled.has(node.id),
      top,
    };
    const previous = rowStates.get(row);
    if (
      previous &&
      previous.id === next.id &&
      previous.title === next.title &&
      previous.kind === next.kind &&
      previous.depth === next.depth &&
      previous.setSize === next.setSize &&
      previous.posInSet === next.posInSet &&
      previous.expanded === next.expanded &&
      previous.selected === next.selected &&
      previous.focused === next.focused &&
      previous.disabled === next.disabled &&
      previous.top === next.top
    ) {
      return false;
    }

    row.dataset["id"] = next.id;
    row.dataset["kind"] = next.kind;
    row.style.transform = `translateY(${next.top}px)`;
    row.style.paddingLeft = `${(next.depth - 1) * 14 + 8}px`;
    row.setAttribute("aria-level", String(next.depth));
    row.setAttribute("aria-setsize", String(next.setSize));
    row.setAttribute("aria-posinset", String(next.posInSet));
    if (next.expanded === null) {
      row.removeAttribute("aria-expanded");
    } else {
      row.setAttribute("aria-expanded", String(next.expanded));
    }
    row.setAttribute("aria-selected", String(next.selected));
    if (next.disabled) {
      row.setAttribute("aria-disabled", "true");
    } else {
      row.removeAttribute("aria-disabled");
    }
    row.tabIndex = next.focused ? 0 : -1;
    row.classList.toggle("is-selected", next.selected);
    row.classList.toggle("is-focused", next.focused);
    row.classList.toggle("is-disabled", next.disabled);
    row.classList.toggle("is-folder", next.kind === "folder");
    const chevron = row.firstElementChild;
    if (chevron) {
      chevron.textContent = next.expanded === null ? "" : next.expanded ? "▾" : "▸";
    }
    const title = row.lastElementChild;
    if (title) {
      title.textContent = next.title;
    }
    rowStates.set(row, next);
    return true;
  }

  function windowRange(): { start: number; end: number } {
    const viewportHeight = viewport.clientHeight || 1;
    const first = Math.floor(viewport.scrollTop / ROW_HEIGHT_PX);
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + 1;
    const start = Math.max(0, first - OVERSCAN_ROWS);
    const end = Math.min(visible.length, first + visibleCount + OVERSCAN_ROWS);
    return { start, end };
  }

  function patch(): void {
    counters.patches += 1;
    let mutatedRows = 0;
    const { start, end } = windowRange();
    const needed = new Set<string>();
    for (let position = start; position < end; position += 1) {
      const node = visible[position];
      if (node) {
        needed.add(node.id);
      }
    }
    for (const [id, row] of mounted) {
      if (!needed.has(id)) {
        mounted.delete(id);
        row.remove();
        rowStates.delete(row);
        pool.push(row);
        mutatedRows += 1;
      }
    }
    for (let position = start; position < end; position += 1) {
      const node = visible[position];
      if (!node) {
        continue;
      }
      let row = mounted.get(node.id);
      let fresh = false;
      if (!row) {
        row = pool.pop() ?? createRow();
        mounted.set(node.id, row);
        fresh = true;
      }
      const changed = applyRow(row, node, position * ROW_HEIGHT_PX);
      if (fresh) {
        sizer.appendChild(row);
      }
      if (fresh || changed) {
        mutatedRows += 1;
      }
    }
    counters.mutatedRows += mutatedRows;
    maxRendered = Math.max(maxRendered, mounted.size);
  }

  function recompute(): void {
    if (!index) {
      visible = [];
    } else {
      visible = flattenVisible(index, expanded);
    }
    rowIndexById = new Map(visible.map((node, position) => [node.id, position]));
    sizer.style.height = `${visible.length * ROW_HEIGHT_PX}px`;
    if (selected !== null && !rowIndexById.has(selected)) {
      selected = null;
    }
    if (focused !== null && !rowIndexById.has(focused)) {
      focused = null;
    }
    patch();
  }

  function mutateRowOnly(id: string | null): void {
    if (id === null) {
      return;
    }
    const row = mounted.get(id);
    const position = rowIndexById.get(id);
    if (row === undefined || position === undefined) {
      return;
    }
    const node = visible[position];
    if (node && applyRow(row, node, position * ROW_HEIGHT_PX)) {
      counters.mutatedRows += 1;
    }
  }

  function ensureRowVisible(position: number): void {
    const viewportHeight = viewport.clientHeight || 1;
    const rowTop = position * ROW_HEIGHT_PX;
    const rowBottom = rowTop + ROW_HEIGHT_PX;
    if (rowTop < viewport.scrollTop) {
      viewport.scrollTop = rowTop;
      patch();
    } else if (rowBottom > viewport.scrollTop + viewportHeight) {
      viewport.scrollTop = rowBottom - viewportHeight;
      patch();
    }
  }

  function focusRowElement(id: string | null): void {
    if (id === null) {
      return;
    }
    const row = mounted.get(id);
    if (row && document.activeElement !== row) {
      row.focus({ preventScroll: true });
    }
  }

  function setFocusSelection(id: string): void {
    const previousFocused = focused;
    const previousSelected = selected;
    focused = id;
    selected = id;
    if (previousFocused !== id) {
      mutateRowOnly(previousFocused);
    }
    if (previousSelected !== id && previousSelected !== previousFocused) {
      mutateRowOnly(previousSelected);
    }
    mutateRowOnly(id);
    const position = rowIndexById.get(id);
    if (position !== undefined) {
      ensureRowVisible(position);
    }
    focusRowElement(id);
  }

  function stepFocus(from: number, direction: 1 | -1): void {
    let position = from + direction;
    while (position >= 0 && position < visible.length) {
      const node = visible[position];
      if (node && !disabled.has(node.id)) {
        setFocusSelection(node.id);
        return;
      }
      position += direction;
    }
  }

  function edgeFocus(direction: 1 | -1): void {
    const from = direction === 1 ? -1 : visible.length;
    stepFocus(from, direction);
  }

  function currentPosition(): number {
    if (focused === null) {
      return -1;
    }
    return rowIndexById.get(focused) ?? -1;
  }

  function handleKey(key: string): void {
    if (visible.length === 0) {
      return;
    }
    const position = currentPosition();
    if (position < 0) {
      edgeFocus(1);
      return;
    }
    const node = visible[position];
    if (!node) {
      return;
    }
    if (key === "ArrowDown") {
      stepFocus(position, 1);
    } else if (key === "ArrowUp") {
      stepFocus(position, -1);
    } else if (key === "Home") {
      edgeFocus(1);
    } else if (key === "End") {
      edgeFocus(-1);
    } else if (key === "ArrowRight") {
      if (node.kind !== "folder") {
        return;
      }
      if (expanded.has(node.id)) {
        stepFocus(position, 1);
      } else {
        expanded.add(node.id);
        recompute();
        setFocusSelection(node.id);
      }
    } else if (key === "ArrowLeft") {
      if (node.kind === "folder" && expanded.has(node.id)) {
        expanded.delete(node.id);
        recompute();
        setFocusSelection(node.id);
      } else if (node.parentId !== null && !disabled.has(node.parentId)) {
        setFocusSelection(node.parentId);
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const handled = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!handled.includes(event.key)) {
      return;
    }
    event.preventDefault();
    handleKey(event.key);
  };
  viewport.addEventListener("keydown", onKeyDown);
  const onScroll = () => {
    patch();
  };
  viewport.addEventListener("scroll", onScroll, { passive: true });

  return {
    setTree(nextIndex, expandedIds) {
      index = nextIndex;
      expanded.clear();
      for (const id of expandedIds) {
        expanded.add(id);
      }
      selected = null;
      focused = null;
      viewport.scrollTop = 0;
      recompute();
    },
    refresh() {
      recompute();
    },
    select(id) {
      const previous = selected;
      selected = id !== null && rowIndexById.has(id) ? id : null;
      if (previous !== selected) {
        mutateRowOnly(previous);
        mutateRowOnly(selected);
      }
    },
    focus(id) {
      if (id !== null && rowIndexById.has(id) && !disabled.has(id)) {
        setFocusSelection(id);
      }
    },
    setDisabled(ids) {
      disabled.clear();
      for (const id of ids) {
        disabled.add(id);
      }
      patch();
    },
    toggleExpanded(id) {
      if (!index) {
        return;
      }
      const node = index.byId.get(id);
      if (!node || node.kind !== "folder") {
        return;
      }
      const collapsing = expanded.has(id);
      const selectionInside =
        collapsing && selected !== null && ancestorIds(index, selected).includes(id);
      const focusInside =
        collapsing && focused !== null && ancestorIds(index, focused).includes(id);
      if (collapsing) {
        expanded.delete(id);
      } else {
        expanded.add(id);
      }
      if (selectionInside) {
        selected = id;
      }
      if (focusInside) {
        focused = id;
      }
      recompute();
    },
    expandAncestors(id) {
      if (!index) {
        return;
      }
      let changed = false;
      for (const ancestor of ancestorIds(index, id)) {
        if (!expanded.has(ancestor)) {
          expanded.add(ancestor);
          changed = true;
        }
      }
      if (changed) {
        recompute();
      }
    },
    isExpanded(id) {
      return expanded.has(id);
    },
    handleKey,
    scrollTo(offsetPx) {
      viewport.scrollTop = offsetPx;
      patch();
    },
    scrollToNode(id) {
      const position = rowIndexById.get(id);
      if (position !== undefined) {
        ensureRowVisible(position);
      }
    },
    selectedId() {
      return selected;
    },
    focusedId() {
      return focused;
    },
    visibleRows() {
      return visible;
    },
    renderedRowIds() {
      return [...mounted.keys()];
    },
    renderedRowCount() {
      return mounted.size;
    },
    maxRenderedRows() {
      return maxRendered;
    },
    counters() {
      return { ...counters };
    },
    layoutHeight() {
      return sizer.offsetHeight;
    },
    element() {
      return viewport;
    },
    destroy() {
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("scroll", onScroll);
      viewport.remove();
    },
  };
}
