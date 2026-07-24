import { memo, useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
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

type RowProps = {
  store: RendererStore;
  id: string;
  metrics: TreeMetrics;
  top: number;
  tabIndex: 0 | -1;
};

export const SidebarRow = memo(function SidebarRow({ store, id, metrics, top, tabIndex }: RowProps) {
  const selectNode = useMemo(() => (state: RendererState) => state.nodes.get(id), [id]);
  const selectStatus = useMemo(
    () => (state: RendererState) =>
      Number(state.activeNoteId === id) |
      (Number(state.focusedNodeId === id) << 1) |
      (Number(state.expandedIds.has(id)) << 2) |
      (Number(state.editingNodeId === id) << 3) |
      (Number(state.selectedNodeIds.has(id)) << 4),
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
  const isFolder = node.kind === "folder";
  const rowTabIndex =
    isFocused || (tabIndex === 0 && store.getState().focusedNodeId === null) ? 0 : -1;
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
          aria-selected={isSelected}
          {...(isFolder ? { "aria-expanded": isExpanded } : {})}
          tabIndex={rowTabIndex}
          data-row-key={id}
          onFocus={() => store.setFocusedNode(id)}
          onClick={(event) => {
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
