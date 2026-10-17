import { pinnedNodeIds } from "@skriuw/renderer-core/store/tree";
import type { RendererState } from "@skriuw/renderer-core/store/types";

let pinnedFor: { sourceNodes: RendererState["sourceNodes"]; ids: string[] } | null = null;

/**
 * @name selectPinnedIds
 * @description Pinned, available node ids, most recently pinned first. The last
 * result is reused while `sourceNodes` keeps its identity, so tree focus,
 * selection and other unrelated updates skip the whole-workspace pass.
 *
 * @example
 * const pinnedIds = useRendererSelector(store, selectPinnedIds, sameIdList);
 */
export function selectPinnedIds(state: RendererState): string[] {
  if (pinnedFor?.sourceNodes === state.sourceNodes) {
    return pinnedFor.ids;
  }
  const ids = pinnedNodeIds([...state.sourceNodes.values()]);
  pinnedFor = { sourceNodes: state.sourceNodes, ids };
  return ids;
}
