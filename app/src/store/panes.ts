import type { WorkspaceNode } from "@/contracts/workspace";
import { unavailableNodeIds } from "./tree";

export type PaneState = {
  paneId: string;
  openNoteIds: readonly string[];
  pinnedNoteIds: readonly string[];
  activeNoteId: string | null;
};

/** `vertical` is a vertical divider: panes side by side. `horizontal` stacks them. */
export type SplitOrientation = "vertical" | "horizontal";

export type PaneLayout = {
  panes: readonly PaneState[];
  orientation: SplitOrientation;
  /** Fraction of the split axis taken by pane 1, clamped to the ratio bounds. */
  ratio: number;
};

export const PRIMARY_PANE_ID = "primary";
export const SECONDARY_PANE_ID = "beside";
export const PANE_LAYOUT_VERSION = 3;

export const DEFAULT_SPLIT_ORIENTATION: SplitOrientation = "vertical";
export const DEFAULT_SPLIT_RATIO = 0.5;
export const MIN_SPLIT_RATIO = 0.15;
export const MAX_SPLIT_RATIO = 0.85;

type PersistedPaneLayout = {
  version: number;
  panes: PaneState[];
  orientation?: SplitOrientation;
  ratio?: number;
};

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_SPLIT_RATIO;
  }
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

export function flipSplitOrientation(orientation: SplitOrientation): SplitOrientation {
  return orientation === "vertical" ? "horizontal" : "vertical";
}

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

function paneWithId(panes: readonly PaneState[], paneId: string): PaneState | null {
  return panes.find((pane) => pane.paneId === paneId) ?? null;
}

function replacePane(
  panes: readonly PaneState[],
  paneId: string,
  next: PaneState,
): readonly PaneState[] {
  return panes.map((pane) => (pane.paneId === paneId ? next : pane));
}

export function openNoteInTab(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
): readonly PaneState[] {
  const pane = paneWithId(panes, paneId);
  if (pane === null || pane.openNoteIds.includes(noteId)) {
    return panes;
  }
  return replacePane(panes, paneId, { ...pane, openNoteIds: [...pane.openNoteIds, noteId] });
}

export type CloseTabResult = {
  panes: readonly PaneState[];
  /**
   * Set when the pane's active tab closed and a neighbor takes over. Callers
   * route it through `activateNote` only for the primary pane, whose active tab
   * mirrors the workspace's active note; other panes already carry it in
   * `panes`.
   */
  nextActiveNoteId: string | null | undefined;
};

export function closeTab(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
): CloseTabResult {
  const pane = paneWithId(panes, paneId);
  const index = pane?.openNoteIds.indexOf(noteId) ?? -1;
  if (pane === null || index < 0) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = pane.openNoteIds.filter((id) => id !== noteId);
  const pinnedNoteIds = pane.pinnedNoteIds.filter((id) => id !== noteId);
  if (pane.activeNoteId !== noteId) {
    return {
      panes: replacePane(panes, paneId, { ...pane, openNoteIds, pinnedNoteIds }),
      nextActiveNoteId: undefined,
    };
  }
  const nextActiveNoteId = openNoteIds[Math.min(index, openNoteIds.length - 1)] ?? null;
  return {
    panes: replacePane(panes, paneId, {
      ...pane,
      openNoteIds,
      pinnedNoteIds,
      activeNoteId: nextActiveNoteId,
    }),
    nextActiveNoteId,
  };
}

function retainTabs(
  panes: readonly PaneState[],
  pane: PaneState,
  openNoteIds: readonly string[],
  fallbackActiveNoteId: string | null,
): CloseTabResult {
  if (openNoteIds.length === pane.openNoteIds.length) {
    return { panes, nextActiveNoteId: undefined };
  }
  const activeSurvives = pane.activeNoteId !== null && openNoteIds.includes(pane.activeNoteId);
  const activeNoteId = activeSurvives ? pane.activeNoteId : fallbackActiveNoteId;
  return {
    panes: replacePane(panes, pane.paneId, { ...pane, openNoteIds, activeNoteId }),
    nextActiveNoteId: activeSurvives ? undefined : activeNoteId,
  };
}

/** Closes every open tab in `paneId` except `noteId` and any pinned tabs. */
export function closeOtherTabs(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
): CloseTabResult {
  const pane = paneWithId(panes, paneId);
  if (pane === null || !pane.openNoteIds.includes(noteId)) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = pane.openNoteIds.filter(
    (id) => id === noteId || pane.pinnedNoteIds.includes(id),
  );
  return retainTabs(panes, pane, openNoteIds, noteId);
}

/** Closes every unpinned tab on the given side of `noteId`, keeping the anchor and any pinned tabs. */
export function closeTabsToSide(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
  side: "left" | "right",
): CloseTabResult {
  const pane = paneWithId(panes, paneId);
  const anchorIndex = pane?.openNoteIds.indexOf(noteId) ?? -1;
  if (pane === null || anchorIndex < 0) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = pane.openNoteIds.filter(
    (id, index) =>
      id === noteId ||
      pane.pinnedNoteIds.includes(id) ||
      (side === "right" ? index <= anchorIndex : index >= anchorIndex),
  );
  return retainTabs(panes, pane, openNoteIds, noteId);
}

/** Closes every unpinned tab in `paneId`. */
export function closeAllTabs(panes: readonly PaneState[], paneId: string): CloseTabResult {
  const pane = paneWithId(panes, paneId);
  if (pane === null) {
    return { panes, nextActiveNoteId: undefined };
  }
  const openNoteIds = pane.openNoteIds.filter((id) => pane.pinnedNoteIds.includes(id));
  return retainTabs(panes, pane, openNoteIds, openNoteIds[openNoteIds.length - 1] ?? null);
}

/** Toggles whether an open tab is pinned; pinned tabs are excluded from bulk-close actions. */
export function togglePinTab(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
): readonly PaneState[] {
  const pane = paneWithId(panes, paneId);
  if (pane === null || !pane.openNoteIds.includes(noteId)) {
    return panes;
  }
  const pinnedNoteIds = pane.pinnedNoteIds.includes(noteId)
    ? pane.pinnedNoteIds.filter((id) => id !== noteId)
    : [...pane.pinnedNoteIds, noteId];
  return replacePane(panes, paneId, { ...pane, pinnedNoteIds });
}

/**
 * Moves an unpinned tab in front of `beforeNoteId` (or to the end when null).
 * Pinned tabs are anchored: they never move, and a dragged tab can only land in
 * a slot that keeps every pinned tab at its original index. Returns the input
 * reference when the move is rejected or is a no-op.
 */
export function reorderTab(
  panes: readonly PaneState[],
  paneId: string,
  noteId: string,
  beforeNoteId: string | null,
): readonly PaneState[] {
  const pane = paneWithId(panes, paneId);
  const from = pane?.openNoteIds.indexOf(noteId) ?? -1;
  if (pane === null || from < 0 || noteId === beforeNoteId || pane.pinnedNoteIds.includes(noteId)) {
    return panes;
  }
  const rest = pane.openNoteIds.filter((id) => id !== noteId);
  const insertAt = beforeNoteId === null ? rest.length : rest.indexOf(beforeNoteId);
  if (insertAt < 0) {
    return panes;
  }
  const openNoteIds = [...rest.slice(0, insertAt), noteId, ...rest.slice(insertAt)];
  const pinnedHeld = pane.pinnedNoteIds.every(
    (id) => openNoteIds.indexOf(id) === pane.openNoteIds.indexOf(id),
  );
  if (!pinnedHeld || openNoteIds[from] === noteId) {
    return panes;
  }
  return replacePane(panes, paneId, { ...pane, openNoteIds });
}

/** The tab `direction` steps from `paneId`'s active tab, wrapping at the ends. */
export function cycleTabId(
  panes: readonly PaneState[],
  paneId: string,
  direction: -1 | 1,
): string | null {
  const pane = paneWithId(panes, paneId);
  if (pane === null || pane.openNoteIds.length < 2 || pane.activeNoteId === null) {
    return null;
  }
  const index = pane.openNoteIds.indexOf(pane.activeNoteId);
  if (index < 0) {
    return pane.openNoteIds[0] ?? null;
  }
  const count = pane.openNoteIds.length;
  return pane.openNoteIds[(index + direction + count) % count] ?? null;
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

/**
 * The pane a wrapping cycle lands on, so repeated presses walk every pane
 * instead of stopping at an end like `paneIndexInDirection`. `fromIndex` null
 * means focus is outside every pane, and the cycle enters from the edge it is
 * heading away from.
 */
export function paneIndexCycling(
  paneCount: number,
  fromIndex: number | null,
  direction: -1 | 1,
): number | null {
  if (paneCount < 2) {
    return null;
  }
  const from = fromIndex ?? (direction === 1 ? paneCount - 1 : 0);
  return (from + direction + paneCount) % paneCount;
}

export type ClosePaneResult = {
  panes: readonly PaneState[];
  /** Set when a promoted survivor brings its own active note into the primary pane. */
  nextActiveNoteId: string | null | undefined;
  /** The id the survivor was promoted from, so its closed-tab stack can follow it. */
  promotedFromPaneId: string | null;
};

/**
 * Discards `paneId` and leaves the survivor as the only pane. Discarding the
 * primary pane promotes the survivor into `PRIMARY_PANE_ID` rather than deleting
 * the wrong list: everything bound to the store's `activeNoteId` follows pane 1.
 */
export function closePane(panes: readonly PaneState[], paneId: string): ClosePaneResult {
  const index = panes.findIndex((pane) => pane.paneId === paneId);
  const survivor = panes[index === 0 ? 1 : 0];
  if (panes.length < 2 || index < 0 || survivor === undefined) {
    return { panes, nextActiveNoteId: undefined, promotedFromPaneId: null };
  }
  if (survivor.paneId === PRIMARY_PANE_ID) {
    return { panes: [survivor], nextActiveNoteId: undefined, promotedFromPaneId: null };
  }
  return {
    panes: [{ ...survivor, paneId: PRIMARY_PANE_ID }],
    nextActiveNoteId: survivor.activeNoteId,
    promotedFromPaneId: survivor.paneId,
  };
}

export function serializePaneLayout(layout: PaneLayout): string {
  const persisted: PersistedPaneLayout = {
    version: PANE_LAYOUT_VERSION,
    panes: layout.panes.map((pane) => ({
      paneId: pane.paneId,
      openNoteIds: [...pane.openNoteIds],
      pinnedNoteIds: [...pane.pinnedNoteIds],
      activeNoteId: pane.activeNoteId,
    })),
    orientation: layout.orientation,
    ratio: layout.ratio,
  };
  return JSON.stringify(persisted);
}

/**
 * Reads a persisted layout, migrating version 2 — which had no geometry —
 * forward by keeping its panes and filling in the default orientation and
 * ratio. Older versions and unparseable payloads return null, which callers
 * treat as "start from a single pane".
 */
export function parsePaneLayout(raw: string | null): PaneLayout | null {
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
  if (
    (layout.version !== PANE_LAYOUT_VERSION && layout.version !== PANE_LAYOUT_VERSION - 1) ||
    !Array.isArray(layout.panes)
  ) {
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
  return {
    panes,
    orientation:
      layout.orientation === "vertical" || layout.orientation === "horizontal"
        ? layout.orientation
        : DEFAULT_SPLIT_ORIENTATION,
    ratio: typeof layout.ratio === "number" ? clampSplitRatio(layout.ratio) : DEFAULT_SPLIT_RATIO,
  };
}
