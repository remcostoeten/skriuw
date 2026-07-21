import { memo, Profiler, useCallback, useEffect, useRef, useState } from "react";
import { recordMount, recordProfilerCommit, recordRender } from "./ledger";
import { TreeRow } from "./TreeRow";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

const ROW_HEIGHT_PX = 28;
const OVERSCAN_ROWS = 8;
const VIEWPORT_HEIGHT_PX = 532;

type Props = {
  store: RendererStore;
};

const selectVisibleIds = (state: ReturnType<RendererStore["getState"]>) => state.visibleIds;

const TreeHostCommitProbe = memo(function TreeHostCommitProbe({ revision: _revision }: { revision: readonly string[] }) {
  return null;
});

export function TreeHost({ store }: Props) {
  recordRender("TreeHost");
  const visibleIds = useRendererSelector(store, selectVisibleIds);
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const didPositionInitial = useRef(false);
  useEffect(() => recordMount("TreeHost"), []);
  useEffect(() => {
    if (didPositionInitial.current) {
      return;
    }
    didPositionInitial.current = true;
    const viewport = viewportRef.current;
    const activeId = store.getState().activeNoteId;
    const position = activeId ? visibleIds.indexOf(activeId) : -1;
    if (viewport && position >= 0) {
      viewport.scrollTop = Math.max(0, position * ROW_HEIGHT_PX - VIEWPORT_HEIGHT_PX / 2);
      setScrollTop(viewport.scrollTop);
    }
  }, [store, visibleIds]);
  const first = Math.floor(scrollTop / ROW_HEIGHT_PX);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT_PX / ROW_HEIGHT_PX) + 1;
  const start = Math.max(0, first - OVERSCAN_ROWS);
  const end = Math.min(visibleIds.length, first + visibleCount + OVERSCAN_ROWS);
  const windowIds = visibleIds.slice(start, end);

  const onScroll = useCallback(() => {
    setScrollTop(viewportRef.current?.scrollTop ?? 0);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const handled = ["ArrowDown", "ArrowUp", "Home", "End", "ArrowLeft", "ArrowRight"];
      if (!handled.includes(event.key)) {
        return;
      }
      event.preventDefault();
      const state = store.getState();
      const current = state.focusedNodeId ? state.visibleIds.indexOf(state.focusedNodeId) : -1;
      let next = current;
      if (event.key === "ArrowDown") {
        next = Math.min(state.visibleIds.length - 1, current + 1);
      } else if (event.key === "ArrowUp") {
        next = Math.max(0, current - 1);
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = state.visibleIds.length - 1;
      } else {
        const node = state.focusedNodeId ? state.nodes.get(state.focusedNodeId) : undefined;
        if (!node) {
          return;
        }
        if (event.key === "ArrowRight" && node.kind === "folder") {
          if (!state.expandedIds.has(node.id)) {
            store.toggleExpanded(node.id);
            return;
          }
          next = Math.min(state.visibleIds.length - 1, current + 1);
        } else if (event.key === "ArrowLeft" && node.kind === "folder" && state.expandedIds.has(node.id)) {
          store.toggleExpanded(node.id);
          return;
        } else if (event.key === "ArrowLeft" && node.parentId) {
          next = state.visibleIds.indexOf(node.parentId);
        } else {
          return;
        }
      }
      while (next >= 0 && next < state.visibleIds.length) {
        const id = state.visibleIds[next];
        if (id && !state.disabledIds.has(id)) {
          const node = state.nodes.get(id);
          if (node?.kind === "note") {
            store.setActiveNote(id);
          } else {
            store.update((currentState) => ({ ...currentState, focusedNodeId: id }));
          }
          const top = next * ROW_HEIGHT_PX;
          const viewport = viewportRef.current;
          if (viewport && (top < viewport.scrollTop || top + ROW_HEIGHT_PX > viewport.scrollTop + VIEWPORT_HEIGHT_PX)) {
            viewport.scrollTop = Math.max(0, top - VIEWPORT_HEIGHT_PX / 2);
          }
          return;
        }
        next += event.key === "ArrowUp" ? -1 : 1;
      }
    },
    [store],
  );

  return (
    <div
      aria-label="Workspace notes"
      className="tree-viewport"
      data-rendered-rows={windowIds.length}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
      ref={viewportRef}
      role="tree"
      tabIndex={0}
    >
      <Profiler id="TreeHost" onRender={recordProfilerCommit}>
        <TreeHostCommitProbe revision={visibleIds} />
      </Profiler>
      <div className="tree-sizer" style={{ height: `${visibleIds.length * ROW_HEIGHT_PX}px` }}>
        {visibleIds.length === 0 ? <p className="tree-empty">No notes in this workspace.</p> : null}
        {windowIds.map((id, offset) => (
          <TreeRow id={id} key={id} position={start + offset} store={store} />
        ))}
      </div>
    </div>
  );
}

export const treeLayout = {
  overscanRows: OVERSCAN_ROWS,
  rowHeightPx: ROW_HEIGHT_PX,
  viewportHeightPx: VIEWPORT_HEIGHT_PX,
};
