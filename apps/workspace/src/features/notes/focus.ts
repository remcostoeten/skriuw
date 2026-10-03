import type { RendererState } from "@skriuw/renderer-core/store/types";

/**
 * The sidebar's focused note, for actions that should follow the tree's cursor
 * while the sidebar owns the keyboard. Null when the focused row is a folder,
 * or nothing is focused, so callers fall back to the open note.
 */
export function focusedTreeNoteId(state: RendererState): string | null {
  const id = state.focusedNodeId;
  if (id === null) {
    return null;
  }
  return state.nodes.get(id)?.kind === "note" ? id : null;
}

/**
 * The sidebar's focused folder, for actions that need a drop target when
 * nothing more specific is selected (e.g. importing a file into "wherever
 * the sidebar is pointed"). Null when the focused row isn't a folder, or
 * nothing is focused, so callers fall back to the workspace root.
 */
export function focusedFolderId(state: RendererState): string | null {
  const id = state.focusedNodeId;
  if (id === null) {
    return null;
  }
  return state.nodes.get(id)?.kind === "folder" ? id : null;
}
