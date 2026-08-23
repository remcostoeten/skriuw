import { opensNotesInTabs } from "@/features/settings/settings-model";
import { type PaneLayout, primaryPane, restorePanes } from "./panes";
import type { RendererState } from "./types";

/**
 * Applies a persisted pane layout to freshly bootstrapped state and decides
 * which note the session reopens on. The workspace's remembered note wins; the
 * primary pane's active tab stands in when the workspace remembered none, which
 * is what carries the last open note across a browser reload: the browser
 * runtime has no window-close hook to persist a selection through, so the
 * debounced pane layout is the only record of where the reader was.
 */
export function restoreSession(
  current: RendererState,
  layout: PaneLayout,
  rememberedNoteId: string | null,
): RendererState {
  const activeNoteId = continuedNoteId(current, layout, rememberedNoteId) ?? current.activeNoteId;
  return {
    ...current,
    activeNoteId,
    focusedNodeId: activeNoteId ?? current.focusedNodeId,
    panes: restorePanes(
      layout.panes,
      activeNoteId,
      current.sourceNodes,
      opensNotesInTabs(current.settings),
    ),
    splitOrientation: layout.orientation,
    splitRatio: layout.ratio,
  };
}

function continuedNoteId(
  current: RendererState,
  layout: PaneLayout,
  rememberedNoteId: string | null,
): string | null {
  if (!current.settings.rememberLastNote) {
    return null;
  }
  const candidates = [rememberedNoteId, primaryPane(layout.panes).activeNoteId];
  for (const candidate of candidates) {
    if (candidate !== null && current.metadata.has(candidate)) {
      return candidate;
    }
  }
  return null;
}
