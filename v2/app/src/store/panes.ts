import type { WorkspaceNode } from "../contracts/workspace";
import { unavailableNodeIds } from "./tree";

export type PaneState = {
  paneId: string;
  openNoteIds: readonly string[];
  pinnedNoteIds: readonly string[];
  activeNoteId: string | null;
};

export const PRIMARY_PANE_ID = "primary";
export const SECONDARY_PANE_ID = "beside";
export const PANE_LAYOUT_VERSION = 2;

type PersistedPaneLayout = {
  version: number;
  panes: PaneState[];
};

export function defaultPanes(activeNoteId: string | null): readonly PaneState[] {
  return [
    {
      paneId: PRIMARY_PANE_ID,
      openNoteIds: activeNoteId === null ? [] : [activeNoteId],
      pinnedNoteIds: [],
      activeNoteId,
    },
  ];
}

/**
 * Reconciles pane state with canonical workspace state: purged notes leave
 * every strip, and the primary pane's active tab always mirrors the store's
 * `activeNoteId`. By default the previous active tab is replaced in place, so
 * ordinary navigation never accumulates tabs; with `openInTabs` the note is
 * appended as a new tab instead. Returns the input reference when nothing
 * changed.
 */
export function syncPanes(
  panes: readonly PaneState[],
  activeNoteId: string | null,
  sourceNodes: ReadonlyMap<string, WorkspaceNode>,
  openInTabs = false,
): readonly PaneState[] {
  const isNote = (id: string) => sourceNodes.get(id)?.kind === "note";
  let changed = false;
  const next = panes.map((pane) => {
    const openNoteIds = pane.openNoteIds.filter(isNote);
    let paneActive = pane.activeNoteId !== null && isNote(pane.activeNoteId)
      ? pane.activeNoteId
      : null;
    if (pane.paneId === PRIMARY_PANE_ID) {
      const previousActive = paneActive;
      paneActive = activeNoteId;
      if (paneActive !== null && !openNoteIds.includes(paneActive)) {
        const slot = openInTabs || previousActive === null ? -1 : openNoteIds.indexOf(previousActive);
        if (slot >= 0) {
          openNoteIds[slot] = paneActive;
        } else {
          openNoteIds.push(paneActive);
        }
      }
    }
    const pinnedNoteIds = pane.pinnedNoteIds.filter((id) => openNoteIds.includes(id));
    const pinnedChanged =
      pinnedNoteIds.length !== pane.pinnedNoteIds.length ||
      pinnedNoteIds.some((id, index) => id !== pane.pinnedNoteIds[index]);
    if (
      !pinnedChanged &&
      paneActive === pane.activeNoteId &&
      openNoteIds.length === pane.openNoteIds.length &&
      openNoteIds.every((id, index) => id === pane.openNoteIds[index])
    ) {
      return pane;
    }
    changed = true;
    return { ...pane, openNoteIds, pinnedNoteIds, activeNoteId: paneActive };
  });
  if (next.length === 0) {
    return defaultPanes(activeNoteId);
  }
  return changed ? next : panes;
}

export function restorePanes(
  panes: readonly PaneState[],
  activeNoteId: string | null,
  sourceNodes: ReadonlyMap<string, WorkspaceNode>,
  openInTabs = false,
): readonly PaneState[] {
  const unavailable = unavailableNodeIds([...sourceNodes.values()]);
  const isAvailableNote = (id: string) =>
    sourceNodes.get(id)?.kind === "note" && !unavailable.has(id);
  const restored = panes.flatMap((pane, index) => {
    const openNoteIds = pane.openNoteIds.filter(isAvailableNote);
    if (index > 0 && openNoteIds.length === 0) {
      return [];
    }
    const activeNoteId =
      pane.activeNoteId !== null &&
      openNoteIds.includes(pane.activeNoteId)
        ? pane.activeNoteId
        : (openNoteIds[0] ?? null);
    return [{
      ...pane,
      openNoteIds,
      pinnedNoteIds: pane.pinnedNoteIds.filter((id) => openNoteIds.includes(id)),
      activeNoteId,
    }];
  });
  return syncPanes(restored, activeNoteId, sourceNodes, openInTabs);
}

export function primaryPane(panes: readonly PaneState[]): PaneState {
  return panes[0] ?? { paneId: PRIMARY_PANE_ID, openNoteIds: [], pinnedNoteIds: [], activeNoteId: null };
}

export function secondaryPane(panes: readonly PaneState[]): PaneState | null {
  return panes[1] ?? null;
}

export function openNoteInTab(
  panes: readonly PaneState[],
  noteId: string,
): readonly PaneState[] {
  const primary = primaryPane(panes);
  const openNoteIds = primary.openNoteIds.includes(noteId)
    ? primary.openNoteIds
    : [...primary.openNoteIds, noteId];
  return [{ ...primary, openNoteIds }, ...panes.slice(1)];
}

export type CloseTabResult = {
  panes: readonly PaneState[];
  /** Set when the primary pane's active tab closed and a neighbor takes over. */
  nextActiveNoteId: string | null | undefined;
};

export function closeTab(
  panes: readonly PaneState[],
  noteId: string,
): CloseTabResult {
  const primary = primaryPane(panes);
  const index = primary.openNoteIds.indexOf(noteId);
  if (index < 0) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = primary.openNoteIds.filter((id) => id !== noteId);
  const pinnedNoteIds = primary.pinnedNoteIds.filter((id) => id !== noteId);
  if (primary.activeNoteId !== noteId) {
    return {
      panes: [{ ...primary, openNoteIds, pinnedNoteIds }, ...panes.slice(1)],
      nextActiveNoteId: undefined,
    };
  }
  const nextActiveNoteId = openNoteIds[Math.min(index, openNoteIds.length - 1)] ?? null;
  return {
    panes: [
      { ...primary, openNoteIds, pinnedNoteIds, activeNoteId: nextActiveNoteId },
      ...panes.slice(1),
    ],
    nextActiveNoteId,
  };
}

function retainTabs(
  panes: readonly PaneState[],
  primary: PaneState,
  openNoteIds: readonly string[],
  fallbackActiveNoteId: string | null,
): CloseTabResult {
  if (openNoteIds.length === primary.openNoteIds.length) {
    return { panes, nextActiveNoteId: undefined };
  }
  const activeSurvives = primary.activeNoteId !== null && openNoteIds.includes(primary.activeNoteId);
  const activeNoteId = activeSurvives ? primary.activeNoteId : fallbackActiveNoteId;
  return {
    panes: [{ ...primary, openNoteIds, activeNoteId }, ...panes.slice(1)],
    nextActiveNoteId: activeSurvives ? undefined : activeNoteId,
  };
}

/** Closes every open tab except `noteId` and any pinned tabs. */
export function closeOtherTabs(
  panes: readonly PaneState[],
  noteId: string,
): CloseTabResult {
  const primary = primaryPane(panes);
  if (!primary.openNoteIds.includes(noteId)) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = primary.openNoteIds.filter(
    (id) => id === noteId || primary.pinnedNoteIds.includes(id),
  );
  return retainTabs(panes, primary, openNoteIds, noteId);
}

/** Closes every unpinned tab on the given side of `noteId`, keeping the anchor and any pinned tabs. */
export function closeTabsToSide(
  panes: readonly PaneState[],
  noteId: string,
  side: "left" | "right",
): CloseTabResult {
  const primary = primaryPane(panes);
  const anchorIndex = primary.openNoteIds.indexOf(noteId);
  if (anchorIndex < 0) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = primary.openNoteIds.filter(
    (id, index) =>
      id === noteId ||
      primary.pinnedNoteIds.includes(id) ||
      (side === "right" ? index <= anchorIndex : index >= anchorIndex),
  );
  return retainTabs(panes, primary, openNoteIds, noteId);
}

/** Closes every unpinned tab. */
export function closeAllTabs(panes: readonly PaneState[]): CloseTabResult {
  const primary = primaryPane(panes);
  const openNoteIds = primary.openNoteIds.filter((id) => primary.pinnedNoteIds.includes(id));
  return retainTabs(panes, primary, openNoteIds, openNoteIds[openNoteIds.length - 1] ?? null);
}

/** Toggles whether an open tab is pinned; pinned tabs are excluded from bulk-close actions. */
export function togglePinTab(panes: readonly PaneState[], noteId: string): readonly PaneState[] {
  const primary = primaryPane(panes);
  if (!primary.openNoteIds.includes(noteId)) {
    return panes;
  }
  const pinnedNoteIds = primary.pinnedNoteIds.includes(noteId)
    ? primary.pinnedNoteIds.filter((id) => id !== noteId)
    : [...primary.pinnedNoteIds, noteId];
  return [{ ...primary, pinnedNoteIds }, ...panes.slice(1)];
}

/**
 * Moves an unpinned tab in front of `beforeNoteId` (or to the end when null).
 * Pinned tabs are anchored: they never move, and a dragged tab can only land in
 * a slot that keeps every pinned tab at its original index. Returns the input
 * reference when the move is rejected or is a no-op.
 */
export function reorderTab(
  panes: readonly PaneState[],
  noteId: string,
  beforeNoteId: string | null,
): readonly PaneState[] {
  const primary = primaryPane(panes);
  const from = primary.openNoteIds.indexOf(noteId);
  if (from < 0 || noteId === beforeNoteId || primary.pinnedNoteIds.includes(noteId)) {
    return panes;
  }
  const rest = primary.openNoteIds.filter((id) => id !== noteId);
  const insertAt = beforeNoteId === null ? rest.length : rest.indexOf(beforeNoteId);
  if (insertAt < 0) {
    return panes;
  }
  const openNoteIds = [...rest.slice(0, insertAt), noteId, ...rest.slice(insertAt)];
  const pinnedHeld = primary.pinnedNoteIds.every(
    (id) => openNoteIds.indexOf(id) === primary.openNoteIds.indexOf(id),
  );
  if (!pinnedHeld || openNoteIds[from] === noteId) {
    return panes;
  }
  return [{ ...primary, openNoteIds }, ...panes.slice(1)];
}

export function cycleTabId(
  panes: readonly PaneState[],
  direction: -1 | 1,
): string | null {
  const primary = primaryPane(panes);
  if (primary.openNoteIds.length < 2 || primary.activeNoteId === null) {
    return null;
  }
  const index = primary.openNoteIds.indexOf(primary.activeNoteId);
  if (index < 0) {
    return primary.openNoteIds[0] ?? null;
  }
  const count = primary.openNoteIds.length;
  return primary.openNoteIds[(index + direction + count) % count] ?? null;
}

function paneById(panes: readonly PaneState[], paneId: string): PaneState | null {
  return panes.find((pane) => pane.paneId === paneId) ?? panes[0] ?? null;
}

/**
 * The tab a 1-based index selects in `paneId`'s strip. Index 0 means the last
 * tab, following the browser convention for the `0` key. Null when the slot is
 * out of range, which callers treat as a silent no-op.
 */
export function tabIdAtIndex(
  panes: readonly PaneState[],
  paneId: string,
  index: number,
): string | null {
  const pane = paneById(panes, paneId);
  if (pane === null || index < 0) {
    return null;
  }
  if (index === 0) {
    return pane.openNoteIds[pane.openNoteIds.length - 1] ?? null;
  }
  return pane.openNoteIds[index - 1] ?? null;
}

/**
 * Makes `noteId` the active tab of `paneId`. Only the split pane needs this:
 * the primary pane's active tab mirrors the workspace's active note, so it is
 * activated through the store instead. Returns the input reference when the
 * note is not open in that pane.
 */
export function activateTabInPane(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
): readonly PaneState[] {
  const pane = panes.find((entry) => entry.paneId === paneId);
  if (!pane || pane.activeNoteId === noteId || !pane.openNoteIds.includes(noteId)) {
    return panes;
  }
  return panes.map((entry) =>
    entry.paneId === paneId ? { ...entry, activeNoteId: noteId } : entry,
  );
}

export type ClosedTab = { noteId: string; index: number };

export type ClosedTabStacks = ReadonlyMap<string, readonly ClosedTab[]>;

/** How many closed tabs a pane remembers; older entries fall off the bottom. */
export const CLOSED_TAB_LIMIT = 10;

/** Pushes a closed tab onto `paneId`'s stack, trimming it to the limit. */
export function recordClosedTab(
  stacks: ClosedTabStacks,
  paneId: string,
  closed: ClosedTab,
): ClosedTabStacks {
  const existing = stacks.get(paneId) ?? [];
  const next = [...existing.filter((entry) => entry.noteId !== closed.noteId), closed];
  return withClosedTabs(stacks, paneId, next.slice(-CLOSED_TAB_LIMIT));
}

/** Replaces `paneId`'s stack, dropping the key entirely when it empties. */
export function withClosedTabs(
  stacks: ClosedTabStacks,
  paneId: string,
  closedTabs: readonly ClosedTab[],
): ClosedTabStacks {
  const next = new Map(stacks);
  if (closedTabs.length === 0) {
    next.delete(paneId);
  } else {
    next.set(paneId, closedTabs);
  }
  return next;
}

/** Forgets a pane's stack, e.g. when the split that owned it closes. */
export function discardClosedTabs(
  stacks: ClosedTabStacks,
  paneId: string,
): ClosedTabStacks {
  if (!stacks.has(paneId)) {
    return stacks;
  }
  const next = new Map(stacks);
  next.delete(paneId);
  return next;
}

export type ReopenClosedTabResult = {
  panes: readonly PaneState[];
  closedTabs: readonly ClosedTab[];
  reopenedNoteId: string | null;
};

/**
 * Reopens the most recently closed tab of `paneId` at the slot it was closed
 * from and makes it that pane's active tab. Entries whose note is gone — trashed
 * or purged since the tab closed — are dropped and the next entry is tried.
 * Returns the input references when nothing was consumed.
 */
export function reopenClosedTab(
  panes: readonly PaneState[],
  closedTabs: readonly ClosedTab[],
  paneId: string,
  isOpenable: (noteId: string) => boolean,
): ReopenClosedTabResult {
  const pane = panes.find((entry) => entry.paneId === paneId);
  const unchanged = { panes, closedTabs, reopenedNoteId: null };
  if (!pane) {
    return unchanged;
  }
  for (let cursor = closedTabs.length - 1; cursor >= 0; cursor -= 1) {
    const closed = closedTabs[cursor];
    if (closed === undefined) {
      continue;
    }
    if (!isOpenable(closed.noteId) || pane.openNoteIds.includes(closed.noteId)) {
      continue;
    }
    const remaining = closedTabs.slice(0, cursor);
    const slot = Math.min(Math.max(closed.index, 0), pane.openNoteIds.length);
    const openNoteIds = [
      ...pane.openNoteIds.slice(0, slot),
      closed.noteId,
      ...pane.openNoteIds.slice(slot),
    ];
    return {
      panes: panes.map((entry) =>
        entry.paneId === paneId
          ? { ...entry, openNoteIds, activeNoteId: closed.noteId }
          : entry,
      ),
      closedTabs: remaining,
      reopenedNoteId: closed.noteId,
    };
  }
  return closedTabs.length === 0
    ? unchanged
    : { panes, closedTabs: [], reopenedNoteId: null };
}

/**
 * Moves `paneId`'s active tab one slot in `direction`, wrapping at the ends.
 * Returns the input reference when the strip holds fewer than two tabs.
 */
export function moveTabInPane(
  panes: readonly PaneState[],
  paneId: string,
  direction: -1 | 1,
): readonly PaneState[] {
  const pane = panes.find((entry) => entry.paneId === paneId);
  if (!pane || pane.openNoteIds.length < 2 || pane.activeNoteId === null) {
    return panes;
  }
  const from = pane.openNoteIds.indexOf(pane.activeNoteId);
  if (from < 0) {
    return panes;
  }
  const count = pane.openNoteIds.length;
  const to = (from + direction + count) % count;
  const rest = pane.openNoteIds.filter((id) => id !== pane.activeNoteId);
  const openNoteIds = [...rest.slice(0, to), pane.activeNoteId, ...rest.slice(to)];
  return panes.map((entry) => (entry.paneId === paneId ? { ...entry, openNoteIds } : entry));
}

export function openBeside(
  panes: readonly PaneState[],
  noteId: string,
): readonly PaneState[] {
  return [
    primaryPane(panes),
    { paneId: SECONDARY_PANE_ID, openNoteIds: [noteId], pinnedNoteIds: [], activeNoteId: noteId },
  ];
}

/**
 * The pane a directional focus move lands on. `fromIndex` null means focus is
 * outside every pane — the sidebar, metadata panel, or rail — and the nearest
 * pane in that direction takes it. Directional means directional: there is no
 * wrap, and a single pane never matches.
 */
export function paneIndexInDirection(
  paneCount: number,
  fromIndex: number | null,
  direction: -1 | 1,
): number | null {
  if (paneCount < 2) {
    return null;
  }
  if (fromIndex === null) {
    return direction === -1 ? 0 : paneCount - 1;
  }
  const next = fromIndex + direction;
  return next >= 0 && next < paneCount ? next : null;
}

export function closeSplit(panes: readonly PaneState[]): readonly PaneState[] {
  return panes.length > 1 ? [primaryPane(panes)] : panes;
}

export function serializePaneLayout(panes: readonly PaneState[]): string {
  const layout: PersistedPaneLayout = {
    version: PANE_LAYOUT_VERSION,
    panes: panes.map((pane) => ({
      paneId: pane.paneId,
      openNoteIds: [...pane.openNoteIds],
      pinnedNoteIds: [...pane.pinnedNoteIds],
      activeNoteId: pane.activeNoteId,
    })),
  };
  return JSON.stringify(layout);
}

export function parsePaneLayout(raw: string | null): readonly PaneState[] | null {
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const layout = value as Partial<PersistedPaneLayout>;
  if (layout.version !== PANE_LAYOUT_VERSION || !Array.isArray(layout.panes)) {
    return null;
  }
  const panes: PaneState[] = [];
  for (const pane of layout.panes.slice(0, 2)) {
    if (
      typeof pane !== "object" ||
      pane === null ||
      typeof pane.paneId !== "string" ||
      !Array.isArray(pane.openNoteIds) ||
      !pane.openNoteIds.every((id: unknown) => typeof id === "string") ||
      !Array.isArray(pane.pinnedNoteIds) ||
      !pane.pinnedNoteIds.every((id: unknown) => typeof id === "string") ||
      (pane.activeNoteId !== null && typeof pane.activeNoteId !== "string")
    ) {
      return null;
    }
    panes.push({
      paneId: pane.paneId,
      openNoteIds: pane.openNoteIds,
      pinnedNoteIds: pane.pinnedNoteIds,
      activeNoteId: pane.activeNoteId,
    });
  }
  if (panes.length === 0 || panes[0]?.paneId !== PRIMARY_PANE_ID) {
    return null;
  }
  return panes;
}
