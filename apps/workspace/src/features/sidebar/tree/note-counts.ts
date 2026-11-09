import { JOURNAL_ROOT_ID } from "@skriuw/renderer-core/journal/constants";
import type { RendererState } from "@skriuw/renderer-core/store/types";

let cached: {
  childrenByParent: RendererState["childrenByParent"];
  nodes: RendererState["nodes"];
  total: number;
} | null = null;

function countUnder(state: RendererState, parentId: string | null): number {
  let count = 0;
  for (const childId of state.childrenByParent.get(parentId) ?? []) {
    if (childId === JOURNAL_ROOT_ID) {
      continue;
    }
    const kind = state.nodes.get(childId)?.kind;
    if (kind === "note") {
      count += 1;
    } else if (kind === "folder") {
      count += countUnder(state, childId);
    }
  }
  return count;
}

/**
 * @name selectNoteTotal
 * @description How many notes the workspace tree holds, journal entries
 * excluded, for the sidebar header. Recounts only when the tree changes.
 *
 * @example
 * useRendererSelector(store, selectNoteTotal); // 128
 */
export function selectNoteTotal(state: RendererState): number {
  if (
    cached !== null &&
    cached.childrenByParent === state.childrenByParent &&
    cached.nodes === state.nodes
  ) {
    return cached.total;
  }
  const total = countUnder(state, null);
  cached = { childrenByParent: state.childrenByParent, nodes: state.nodes, total };
  return total;
}
