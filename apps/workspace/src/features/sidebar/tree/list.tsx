import type { KeyboardEvent, UIEvent } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { DropIndicator } from "../drag/drop-indicator";
import type { DropTarget } from "../drag/rules";
import { focusTreeItem, type TreeRef } from "./focus";
import type { TreeMetrics } from "./metrics";
import type { TreePointerHandlers } from "./pointer";
import { SidebarRow } from "./row";
import type { TreeWindow } from "./viewport";

type Props = {
  store: RendererStore;
  treeRef: TreeRef;
  visibleIds: readonly string[];
  metrics: TreeMetrics;
  rowPitch: number;
  treeWindow: TreeWindow;
  touchRows: boolean;
  movingSet: ReadonlySet<string> | null;
  dropTarget: DropTarget | null;
  pointer: TreePointerHandlers;
  onKeyDown: (event: KeyboardEvent) => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
};

export function TreeList({
  store,
  treeRef,
  visibleIds,
  metrics,
  rowPitch,
  treeWindow,
  touchRows,
  movingSet,
  dropTarget,
  pointer,
  onKeyDown,
  onScroll,
}: Props) {
  const renderedIds = visibleIds.slice(treeWindow.start, treeWindow.end);
  const treeTabStopId = visibleIds[0] ?? null;
  return (
    <div
      ref={treeRef}
      className="relative min-h-0 flex-1 overflow-y-auto px-1.5"
      style={touchRows ? { touchAction: "pan-y" } : undefined}
      role="tree"
      aria-label="Workspace"
      tabIndex={-1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          focusTreeItem(treeRef, store.getState().focusedNodeId ?? treeTabStopId);
        }
      }}
      onKeyDown={onKeyDown}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onPointerCancel={pointer.onPointerCancel}
      onClickCapture={pointer.onClickCapture}
      onScroll={onScroll}
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
        <DropIndicator
          store={store}
          dropTarget={dropTarget}
          visibleIds={visibleIds}
          rowPitch={rowPitch}
          metrics={metrics}
        />
      </div>
    </div>
  );
}
