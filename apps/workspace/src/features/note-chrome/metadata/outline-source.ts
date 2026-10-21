import { rendersRawEditor } from "@/features/editor/editor-mode";
import type { RendererState } from "@skriuw/renderer-core/store/types";

export type OutlineRebind = "restart" | "remount";

/**
 * @name selectOutlineSource
 * @description Identifies the editor surface the outline reads headings from:
 * the active note and whether it renders in the raw or the rich editor. It
 * changes on note switches and raw/rich swaps but not on document edits, so
 * the outline can rebind without subscribing to the keystroke path.
 *
 * @example
 * const source = useRendererSelector(store, selectOutlineSource);
 */
export function selectOutlineSource(state: RendererState): string | null {
  const noteId = state.activeNoteId;
  if (noteId === null) {
    return null;
  }
  return `${noteId}:${rendersRawEditor(state, noteId) ? "raw" : "rich"}`;
}

/**
 * @name planOutlineRebind
 * @description Decides what the outline does when its source changes. A
 * controller still bound to the live editor host only restarts its line
 * animation; one whose host was replaced or removed, as on a raw/rich swap,
 * remounts against the current host, retrying until one appears.
 *
 * @example
 * if (planOutlineRebind(mountedHost, locateEditorHost(0)?.proseHost ?? null) === "remount") {
 *   remount();
 * }
 */
export function planOutlineRebind<THost>(
  mountedHost: THost | null,
  currentHost: THost | null,
): OutlineRebind {
  return mountedHost !== null && mountedHost === currentHost ? "restart" : "remount";
}
