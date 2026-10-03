import { FolderInputIcon } from "@/shared/icons/static";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { moveDropTarget } from "./rules";

type Props = {
  store: RendererStore;
  ids: readonly string[];
};

function selectFocusedNodeId(state: RendererState) {
  return state.focusedNodeId;
}

export function MoveBanner({ store, ids }: Props) {
  const moveFocusId = useRendererSelector(store, selectFocusedNodeId);
  const nodes = store.getState().nodes;
  const target = moveDropTarget(nodes, moveFocusId);
  const targetLabel =
    target.kind === "root-gap" ? "Top level" : (nodes.get(target.id)?.title ?? "folder");
  return (
    <div className="mx-1.5 mb-1 flex items-center gap-2 border border-foreground/20 bg-foreground/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-foreground">
      <FolderInputIcon size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">
        Moving {ids.length} item{ids.length > 1 ? "s" : ""} →{" "}
        <span className="text-foreground">{targetLabel}</span>
      </span>
      <span className="ml-auto shrink-0 text-muted-foreground">↵ drop · esc cancel</span>
    </div>
  );
}
