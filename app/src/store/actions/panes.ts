import { opensNotesInTabs } from "@/features/settings/settings-model";
import type { RendererState, RendererStore } from "@/store/types";
import {
  DEFAULT_SPLIT_RATIO,
  PRIMARY_PANE_ID,
  SECONDARY_PANE_ID,
  type CloseTabResult,
  type SplitOrientation,
  activateTabInPane,
  clampSplitRatio,
  closeAllTabs as closeAllTabsInPanes,
  closeOtherTabs as closeOtherTabsInPanes,
  closePane as closePaneInPanes,
  closeTab as closeTabInPanes,
  closeTabsToSide as closeTabsToSideInPanes,
  cycleTabId,
  discardClosedTabs,
  flipSplitOrientation,
  moveTabInPane,
  openBeside as openBesidePanes,
  openNoteInTab as openNoteInTabPanes,
  paneIndexCycling,
  paneIndexInDirection,
  recordClosedTab,
  reopenClosedTab as reopenClosedTabInPanes,
  reorderTab as reorderTabInPanes,
  tabIdAtIndex,
  togglePinTab as togglePinTabInPanes,
  withClosedTabs,
} from "@/store/panes";
import { activateNote } from "./workspace";

/**
 * The pane a pane-scoped action targets: the focused one, or the primary pane
 * when the focused id no longer exists.
 */
export function tabStripPaneId(state: RendererState): string {
  return state.panes.some((pane) => pane.paneId === state.focusedPaneId)
    ? state.focusedPaneId
    : PRIMARY_PANE_ID;
}

export function openNoteInTab(store: RendererStore, noteId: string): void {
  if (store.getState().nodes.get(noteId)?.kind !== "note") {
    return;
  }
  store.update((current) => ({
    ...current,
    panes: openNoteInTabPanes(current.panes, PRIMARY_PANE_ID, noteId),
  }));
  activateNote(store, noteId);
}

export function activateTab(store: RendererStore, noteId: string): void {
  activateNote(store, noteId);
}

/** Closes the focused pane's active tab. The split only closes if that empties the pane. */
export function closeActiveTab(store: RendererStore): void {
  const state = store.getState();
  const paneId = tabStripPaneId(state);
  const activeNoteId = state.panes.find((pane) => pane.paneId === paneId)?.activeNoteId ?? null;
  if (activeNoteId !== null) {
    closeTab(store, activeNoteId, paneId);
  }
}

export function closeTab(store: RendererStore, noteId: string, targetPaneId?: string): void {
  const state = store.getState();
  const paneId = targetPaneId ?? tabStripPaneId(state);
  const pane = state.panes.find((entry) => entry.paneId === paneId);
  const index = pane?.openNoteIds.indexOf(noteId) ?? -1;
  if (index < 0) {
    return;
  }
  const result = closeTabInPanes(state.panes, paneId, noteId);
  const emptied = result.panes.find((entry) => entry.paneId === paneId)?.openNoteIds.length === 0;
  store.update((current) => ({
    ...current,
    panes: result.panes,
    closedTabsByPaneId: recordClosedTab(current.closedTabsByPaneId, paneId, { noteId, index }),
  }));
  if (result.nextActiveNoteId !== undefined && paneId === PRIMARY_PANE_ID) {
    activateNote(store, result.nextActiveNoteId);
  }
  if (emptied) {
    closePane(store, paneId);
  }
}

/**
 * Reopens the focused pane's most recently closed tab at its old position,
 * skipping notes trashed since. Silently does nothing when the tabbed workspace
 * is off or the stack holds nothing reopenable.
 */
export function reopenClosedTab(store: RendererStore): void {
  const state = store.getState();
  if (!opensNotesInTabs(state.settings)) {
    return;
  }
  const paneId = tabStripPaneId(state);
  const closedTabs = state.closedTabsByPaneId.get(paneId) ?? [];
  const result = reopenClosedTabInPanes(
    state.panes,
    closedTabs,
    paneId,
    (noteId) => state.nodes.get(noteId)?.kind === "note",
  );
  if (result.reopenedNoteId === null && result.closedTabs === closedTabs) {
    return;
  }
  store.update((current) => ({
    ...current,
    panes: result.panes,
    closedTabsByPaneId: withClosedTabs(current.closedTabsByPaneId, paneId, result.closedTabs),
  }));
  if (result.reopenedNoteId !== null && paneId === PRIMARY_PANE_ID) {
    activateNote(store, result.reopenedNoteId);
  }
}

/**
 * Moves the focused pane's active tab one slot left or right, wrapping at the
 * ends. A single tab is a silent no-op.
 */
export function moveActiveTab(store: RendererStore, direction: -1 | 1): void {
  const state = store.getState();
  if (!opensNotesInTabs(state.settings)) {
    return;
  }
  const paneId = tabStripPaneId(state);
  store.update((current) => {
    const panes = moveTabInPane(current.panes, paneId, direction);
    return panes === current.panes ? current : { ...current, panes };
  });
}

/**
 * Applies a bulk close to `paneId`, collapsing the pane when it empties and
 * routing the survivor through `activateNote` only for the primary pane.
 */
function applyBulkClose(
  store: RendererStore,
  paneId: string,
  close: (state: RendererState) => CloseTabResult,
): void {
  const result = close(store.getState());
  const emptied = result.panes.find((entry) => entry.paneId === paneId)?.openNoteIds.length === 0;
  store.update((current) => ({ ...current, panes: result.panes }));
  if (result.nextActiveNoteId !== undefined && paneId === PRIMARY_PANE_ID) {
    activateNote(store, result.nextActiveNoteId);
  }
  if (emptied) {
    closePane(store, paneId);
  }
}

export function closeOtherTabs(store: RendererStore, noteId: string, targetPaneId?: string): void {
  const paneId = targetPaneId ?? tabStripPaneId(store.getState());
  applyBulkClose(store, paneId, (state) => closeOtherTabsInPanes(state.panes, paneId, noteId));
}

export function closeTabsToSide(
  store: RendererStore,
  noteId: string,
  side: "left" | "right",
  targetPaneId?: string,
): void {
  const paneId = targetPaneId ?? tabStripPaneId(store.getState());
  applyBulkClose(store, paneId, (state) =>
    closeTabsToSideInPanes(state.panes, paneId, noteId, side),
  );
}

export function closeAllTabs(store: RendererStore, targetPaneId?: string): void {
  const paneId = targetPaneId ?? tabStripPaneId(store.getState());
  applyBulkClose(store, paneId, (state) => closeAllTabsInPanes(state.panes, paneId));
}

export function togglePinTab(store: RendererStore, noteId: string, targetPaneId?: string): void {
  const paneId = targetPaneId ?? tabStripPaneId(store.getState());
  store.update((current) => ({
    ...current,
    panes: togglePinTabInPanes(current.panes, paneId, noteId),
  }));
}

export function reorderTab(
  store: RendererStore,
  noteId: string,
  beforeNoteId: string | null,
  targetPaneId?: string,
): void {
  const paneId = targetPaneId ?? tabStripPaneId(store.getState());
  store.update((current) => ({
    ...current,
    panes: reorderTabInPanes(current.panes, paneId, noteId, beforeNoteId),
  }));
}

/**
 * Activates the tab at a 1-based position in the focused pane's strip, or the
 * last tab for index 0. Silently does nothing when the tabbed workspace is off
 * or the slot is out of range.
 */
export function activateTabAtIndex(store: RendererStore, index: number): void {
  const state = store.getState();
  if (!opensNotesInTabs(state.settings)) {
    return;
  }
  const paneId = tabStripPaneId(state);
  const noteId = tabIdAtIndex(state.panes, paneId, index);
  if (noteId === null) {
    return;
  }
  activateTabIn(store, paneId, noteId);
}

export function cycleTab(store: RendererStore, direction: -1 | 1): void {
  const state = store.getState();
  const paneId = tabStripPaneId(state);
  const nextId = cycleTabId(state.panes, paneId, direction);
  if (nextId !== null) {
    activateTabIn(store, paneId, nextId);
  }
}

function activateTabIn(store: RendererStore, paneId: string, noteId: string): void {
  if (paneId === PRIMARY_PANE_ID) {
    activateNote(store, noteId);
    return;
  }
  store.update((current) => ({
    ...current,
    panes: activateTabInPane(current.panes, paneId, noteId),
  }));
}

export function openBeside(store: RendererStore, noteId?: string): void {
  const state = store.getState();
  const targetId = noteId ?? state.activeNoteId;
  if (targetId === null || state.nodes.get(targetId)?.kind !== "note") {
    return;
  }
  store.update((current) => ({
    ...current,
    panes: openBesidePanes(current.panes, targetId),
  }));
  focusPane(store, SECONDARY_PANE_ID);
}

/**
 * Splits along `orientation`, opening the note beside the current one. An
 * existing split keeps its panes and only re-lays out, so the two orientation
 * keys double as layout switches instead of replacing whatever the second pane
 * holds. The orientation only lands once a split actually exists.
 */
export function splitPane(
  store: RendererStore,
  orientation: SplitOrientation,
  noteId?: string,
): void {
  if (store.getState().panes.length < 2) {
    openBeside(store, noteId);
  }
  if (store.getState().panes.length > 1) {
    setSplitOrientation(store, orientation);
  }
}

/** Discards the focused pane, promoting the survivor into the primary slot. */
export function closeSplit(store: RendererStore): void {
  closePane(store, tabStripPaneId(store.getState()));
}

export function closePane(store: RendererStore, paneId: string): void {
  const state = store.getState();
  const result = closePaneInPanes(state.panes, paneId);
  if (result.panes === state.panes) {
    return;
  }
  const promotedFrom = result.promotedFromPaneId;
  store.update((current) => {
    const inherited =
      promotedFrom === null
        ? current.closedTabsByPaneId
        : withClosedTabs(
            current.closedTabsByPaneId,
            PRIMARY_PANE_ID,
            current.closedTabsByPaneId.get(promotedFrom) ?? [],
          );
    return {
      ...current,
      panes: result.panes,
      closedTabsByPaneId: discardClosedTabs(
        inherited,
        promotedFrom ?? SECONDARY_PANE_ID,
      ),
      focusedPaneId: PRIMARY_PANE_ID,
    };
  });
  if (result.nextActiveNoteId !== undefined) {
    activateNote(store, result.nextActiveNoteId);
  }
}

export function setSplitOrientation(store: RendererStore, orientation: SplitOrientation): void {
  store.update((current) =>
    current.splitOrientation === orientation ? current : { ...current, splitOrientation: orientation },
  );
}

export function toggleSplitOrientation(store: RendererStore): void {
  store.update((current) => ({
    ...current,
    splitOrientation: flipSplitOrientation(current.splitOrientation),
  }));
}

/** Commits a divider position. Drag previews geometry locally and calls this once on release. */
export function setSplitRatio(store: RendererStore, ratio: number): void {
  const splitRatio = clampSplitRatio(ratio);
  store.update((current) =>
    current.splitRatio === splitRatio ? current : { ...current, splitRatio },
  );
}

export function resetSplitRatio(store: RendererStore): void {
  setSplitRatio(store, DEFAULT_SPLIT_RATIO);
}

function focusPaneAtIndex(store: RendererStore, index: number | null): number | null {
  const paneId = index === null ? undefined : store.getState().panes[index]?.paneId;
  if (index === null || paneId === undefined) {
    return null;
  }
  focusPane(store, paneId);
  return index;
}

/**
 * Marks the pane one step in `direction` from `fromIndex` as focused and returns
 * its on-screen index so the caller can move DOM focus into it. Null means the
 * move was a no-op: no split, or no pane that way.
 */
export function focusPaneTowards(
  store: RendererStore,
  direction: -1 | 1,
  fromIndex: number | null,
): number | null {
  const state = store.getState();
  return focusPaneAtIndex(
    store,
    paneIndexInDirection(state.panes.length, fromIndex, direction),
  );
}

/** `focusPaneTowards` that wraps, so repeated presses cycle through the panes. */
export function cyclePaneFocus(
  store: RendererStore,
  direction: -1 | 1,
  fromIndex: number | null,
): number | null {
  const state = store.getState();
  return focusPaneAtIndex(store, paneIndexCycling(state.panes.length, fromIndex, direction));
}

export function focusPane(store: RendererStore, paneId: string): void {
  store.update((current) =>
    current.focusedPaneId === paneId ||
    !current.panes.some((pane) => pane.paneId === paneId)
      ? current
      : { ...current, focusedPaneId: paneId },
  );
}
