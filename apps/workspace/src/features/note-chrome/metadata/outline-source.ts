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
  return outlineSourceFor(state, state.activeNoteId);
}

/**
 * @name outlineSourceFor
 * @description Identifies the editor surface the outline reads headings from
 * for a given note, so a caller that already holds the note id, such as the
 * deferred metadata panel, rebinds only after it has rendered that note.
 *
 * @example
 * const source = useRendererSelector(store, (state) => outlineSourceFor(state, noteId));
 */
export function outlineSourceFor(state: RendererState, noteId: string | null): string | null {
  if (noteId === null) {
    return null;
  }
  return `${noteId}:${rendersRawEditor(state, noteId) ? "raw" : "rich"}`;
}

export type OutlineEntry<TElement> = {
  element: TElement;
  label: string;
  depth: number;
};

export type OutlineUpdate = "none" | "labels" | "rebuild";

/**
 * @name planOutlineUpdate
 * @description Compares the headings the outline shows with the headings the
 * editor now holds. Identical headings need nothing, renamed headings only
 * need their link text replaced, and any added, removed, replaced, or
 * re-levelled heading rebuilds the list and its geometry.
 *
 * @example
 * if (planOutlineUpdate(items, collectOutlineItems(host)) === "rebuild") {
 *   rebuildList();
 * }
 */
export function planOutlineUpdate<TElement>(
  previous: readonly OutlineEntry<TElement>[],
  next: readonly OutlineEntry<TElement>[],
): OutlineUpdate {
  if (previous.length !== next.length) {
    return "rebuild";
  }
  let update: OutlineUpdate = "none";
  for (let index = 0; index < next.length; index += 1) {
    const before = previous[index]!;
    const after = next[index]!;
    if (before.element !== after.element || before.depth !== after.depth) {
      return "rebuild";
    }
    if (before.label !== after.label) {
      update = "labels";
    }
  }
  return update;
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
