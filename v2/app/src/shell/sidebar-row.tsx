import { memo, useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { activateNote, renameNode } from "../actions/workspace";
import { useRendererSelector } from "../store/use-renderer-selector";
import { FolderIcon, FolderOpenIcon } from "../shared/icons";
import { visualTreeIndent } from "../store/tree";
import type { RendererState, RendererStore } from "../store/types";
import type { TreeMetrics } from "./sidebar";

const rowBaseClass =
  "relative flex h-[34px] w-full items-center overflow-hidden border border-transparent text-left text-xs font-medium transition-colors active:scale-[0.985]";

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

type RowLabelProps = {
  isFolder: boolean;
  isExpanded: boolean;
  isNarrow: boolean;
  grow?: boolean;
  children: ReactNode;
};

function RowLabel({ isFolder, isExpanded, isNarrow, grow = false, children }: RowLabelProps) {
  const Icon = isExpanded ? FolderOpenIcon : FolderIcon;
  return (
    <span
      className={`flex min-w-0 items-center${grow ? " flex-1" : ""} ${isNarrow ? "gap-1" : "gap-1.5"}`}
    >
      {isFolder && (
        <Icon size={14} className="shrink-0 text-muted-foreground/70" />
      )}
      <span className="flex h-[18px] min-w-0 flex-1 items-center">{children}</span>
    </span>
  );
}

type RowProps = {
  store: RendererStore;
  id: string;
  metrics: TreeMetrics;
  top: number;
  tabIndex: 0 | -1;
  moving?: boolean;
  /**
   * Renders the row inside the pinned shelf: flat indentation regardless of
   * tree depth, and a select callback that reveals the node in the main tree
   * instead of toggling it in place.
   */
  shelf?: boolean;
  onShelfSelect?: (id: string) => void;
};

export const SidebarRow = memo(function SidebarRow({
  store,
  id,
  metrics,
  top,
  tabIndex,
  moving = false,
  shelf = false,
  onShelfSelect,
}: RowProps) {
  const selectNode = useMemo(() => (state: RendererState) => state.nodes.get(id), [id]);
  const selectStatus = useMemo(
    () => (state: RendererState) =>
      Number(state.activeNoteId === id) |
      (Number(state.focusedNodeId === id) << 1) |
      (Number(state.expandedIds.has(id)) << 2) |
      (Number(state.editingNodeId === id) << 3) |
      (Number(state.selectedNodeIds.has(id)) << 4) |
      (Number(state.focusedNodeId === null) << 5),
    [id],
  );
  const node = useRendererSelector(store, selectNode);
  const status = useRendererSelector(store, selectStatus);
  if (!node) {
    return null;
  }
  const isActive = (status & 1) !== 0;
  const isFocused = (status & 2) !== 0;
  const isExpanded = (status & 4) !== 0;
  const isEditing = (status & 8) !== 0;
  const isSelected = (status & 16) !== 0;
  const focusUnset = (status & 32) !== 0;
  const isFolder = node.kind === "folder";
  const rowTabIndex = shelf
    ? tabIndex
    : isFocused || (tabIndex === 0 && focusUnset)
      ? 0
      : -1;
  const rowDepth = shelf ? 1 : node.depth;
  const stateClass = isFocused
    ? "bg-foreground/[0.22] text-foreground"
    : isActive
      ? "border-border bg-muted text-foreground"
      : isSelected
        ? "border-foreground/[0.24] bg-foreground/[0.1] text-foreground"
      : isFolder
        ? "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88"
        : "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground/85";
  return (
    <div
      className="absolute inset-x-0"
      style={{ top: `${top}px` }}
    >
      {isEditing && !shelf ? (
        <div
          className={`relative flex h-[34px] w-full items-center overflow-hidden border border-border bg-muted text-left text-xs font-medium text-foreground${isFolder ? " justify-between" : ""}`}
          style={rowIndentStyle(rowDepth, metrics)}
        >
          <RowLabel isFolder={isFolder} isExpanded={isExpanded} isNarrow={metrics.isNarrow} grow>
            <RenameInput store={store} id={id} initialTitle={node.title} />
          </RowLabel>
        </div>
      ) : (
        <button
          type="button"
          id={shelf ? `pinned-${id}` : `treeitem-${id}`}
          className={`${rowBaseClass} ${isFolder ? "justify-between " : ""}${stateClass}${moving ? " opacity-45" : ""}`}
          style={rowIndentStyle(rowDepth, metrics)}
          {...(shelf
            ? {}
            : {
                role: "treeitem",
                "aria-level": node.depth,
                "aria-setsize": node.setSize,
                "aria-posinset": node.posInSet,
                "aria-selected": isSelected,
                ...(isFolder ? { "aria-expanded": isExpanded } : {}),
              })}
          tabIndex={rowTabIndex}
          data-row-key={id}
          onFocus={shelf ? undefined : () => store.setFocusedNode(id)}
          onClick={(event) => {
            if (shelf) {
              onShelfSelect?.(id);
              return;
            }
            const selectionMode = event.shiftKey
              ? "range"
              : event.ctrlKey || event.metaKey
                ? "toggle"
                : "replace";
            store.selectTreeNode(id, selectionMode);
            store.setFocusedNode(id);
            if (selectionMode !== "replace") {
              return;
            }
            if (isFolder) {
              store.toggleExpanded(id);
            } else {
              activateNote(store, id);
            }
          }}
        >
          <RowLabel isFolder={isFolder} isExpanded={isExpanded} isNarrow={metrics.isNarrow}>
            <span className="select-none truncate text-left">{node.title}</span>
          </RowLabel>
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
