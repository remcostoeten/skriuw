import type { WorkspaceNode } from "../contracts/workspace";

export type PaneState = {
  paneId: string;
  openNoteIds: readonly string[];
  activeNoteId: string | null;
};

export const PRIMARY_PANE_ID = "primary";
export const SECONDARY_PANE_ID = "beside";
export const PANE_LAYOUT_VERSION = 1;

type PersistedPaneLayout = {
  version: number;
  panes: PaneState[];
};

export function defaultPanes(activeNoteId: string | null): readonly PaneState[] {
  return [
    {
      paneId: PRIMARY_PANE_ID,
      openNoteIds: activeNoteId === null ? [] : [activeNoteId],
      activeNoteId,
    },
  ];
}

/**
 * Reconciles pane state with canonical workspace state: purged notes leave
 * every strip, and the primary pane's active tab always mirrors the store's
 * `activeNoteId` (replacing the previous active tab in place, so ordinary
 * navigation never accumulates tabs). Returns the input reference when
 * nothing changed.
 */
export function syncPanes(
  panes: readonly PaneState[],
  activeNoteId: string | null,
  sourceNodes: ReadonlyMap<string, WorkspaceNode>,
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
        const slot = previousActive === null ? -1 : openNoteIds.indexOf(previousActive);
        if (slot >= 0) {
          openNoteIds[slot] = paneActive;
        } else {
          openNoteIds.push(paneActive);
        }
      }
    }
    if (
      paneActive === pane.activeNoteId &&
      openNoteIds.length === pane.openNoteIds.length &&
      openNoteIds.every((id, index) => id === pane.openNoteIds[index])
    ) {
      return pane;
    }
    changed = true;
    return { ...pane, openNoteIds, activeNoteId: paneActive };
  });
  if (next.length === 0) {
    return defaultPanes(activeNoteId);
  }
  return changed ? next : panes;
}

export function primaryPane(panes: readonly PaneState[]): PaneState {
  return panes[0] ?? { paneId: PRIMARY_PANE_ID, openNoteIds: [], activeNoteId: null };
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
  if (primary.activeNoteId !== noteId) {
    return {
      panes: [{ ...primary, openNoteIds }, ...panes.slice(1)],
      nextActiveNoteId: undefined,
    };
  }
  const nextActiveNoteId = openNoteIds[Math.min(index, openNoteIds.length - 1)] ?? null;
  return {
    panes: [{ ...primary, openNoteIds, activeNoteId: nextActiveNoteId }, ...panes.slice(1)],
    nextActiveNoteId,
  };
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
    { paneId: SECONDARY_PANE_ID, openNoteIds: [noteId], activeNoteId: noteId },
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
      (pane.activeNoteId !== null && typeof pane.activeNoteId !== "string")
    ) {
      return null;
    }
    panes.push({
      paneId: pane.paneId,
      openNoteIds: pane.openNoteIds,
      activeNoteId: pane.activeNoteId,
    });
  }
  if (panes.length === 0 || panes[0]?.paneId !== PRIMARY_PANE_ID) {
    return null;
  }
  return panes;
}
