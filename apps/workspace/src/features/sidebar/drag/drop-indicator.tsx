import { visualTreeIndent } from "@skriuw/renderer-core/store/tree";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { maximumTreeIndent, type TreeMetrics } from "../tree/metrics";
import { indicatorIndentDepth, type DropTarget } from "./rules";

type Props = {
  store: RendererStore;
  dropTarget: DropTarget | null;
  visibleIds: readonly string[];
  rowPitch: number;
  metrics: TreeMetrics;
};

export function DropIndicator({ store, dropTarget, visibleIds, rowPitch, metrics }: Props) {
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
  const indent = visualTreeIndent(
    depth,
    metrics.basePadding,
    metrics.depthIndent,
    maximumTreeIndent(metrics),
  );
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
