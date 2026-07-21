import { memo, Profiler, useMemo } from "react";
import { recordProfilerCommit, recordRender } from "./ledger";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

type RowSelection = {
  active: boolean;
  disabled: boolean;
  expanded: boolean;
  focused: boolean;
};

type Props = {
  id: string;
  position: number;
  store: RendererStore;
};

const equalRowSelection = (left: RowSelection, right: RowSelection) =>
  left.active === right.active &&
  left.disabled === right.disabled &&
  left.expanded === right.expanded &&
  left.focused === right.focused;

function TreeRowContent({ id, position, store }: Props) {
  recordRender(`TreeRow:${id}`);
  const node = store.getState().nodes.get(id);
  const selector = useMemo(
    () => (state: ReturnType<RendererStore["getState"]>): RowSelection => ({
      active: state.activeNoteId === id,
      disabled: state.disabledIds.has(id),
      expanded: state.expandedIds.has(id),
      focused: state.focusedNodeId === id,
    }),
    [id],
  );
  const selection = useRendererSelector(store, selector, equalRowSelection);
  if (!node) {
    return null;
  }
  const onActivate = () => {
    if (selection.disabled) {
      return;
    }
    if (node.kind === "folder") {
      store.toggleExpanded(id);
    } else {
      store.setActiveNote(id);
    }
  };
  return (
    <button
      className="tree-row"
      data-node-id={id}
      data-kind={node.kind}
      aria-disabled={selection.disabled || undefined}
      aria-expanded={node.kind === "folder" ? selection.expanded : undefined}
      aria-level={node.depth}
      aria-posinset={node.posInSet}
      aria-selected={selection.active}
      aria-setsize={node.setSize}
      onClick={onActivate}
      role="treeitem"
      style={{
        paddingLeft: `${Math.min(node.depth - 1, 12) * 12 + 10}px`,
        transform: `translateY(${position * 28}px)`,
      }}
      tabIndex={selection.focused ? 0 : -1}
      type="button"
    >
      <span className="row-marker" aria-hidden="true">
        {node.kind === "folder" ? (selection.expanded ? "−" : "+") : "·"}
      </span>
      <span className="row-title">{node.title}</span>
      {selection.disabled ? <span className="row-state">locked</span> : null}
    </button>
  );
}

function ProfiledTreeRow(props: Props) {
  return (
    <Profiler id={`TreeRow:${props.id}`} onRender={recordProfilerCommit}>
      <TreeRowContent {...props} />
    </Profiler>
  );
}

export const TreeRow = memo(ProfiledTreeRow);
