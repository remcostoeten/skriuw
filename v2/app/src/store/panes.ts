import type { WorkspaceNode } from "../contracts/workspace";

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

export function openBeside(
  panes: readonly PaneState[],
  noteId: string,
): readonly PaneState[] {
  return [
    primaryPane(panes),
    { paneId: SECONDARY_PANE_ID, openNoteIds: [noteId], pinnedNoteIds: [], activeNoteId: noteId },
  ];
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
