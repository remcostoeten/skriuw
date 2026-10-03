export type ShellMode = "compact" | "full";

export type PanelPolicy = {
  sidebarOpen: boolean;
  metadataOpen: boolean;
};

export function shellMode(compact: boolean): ShellMode {
  return compact ? "compact" : "full";
}

/**
 * What the side panels do when the shell enters compact mode. A phone starts
 * on the note itself; the tree is offered only when there is nothing to read
 * yet, and the inspector always waits to be asked.
 */
export function compactPanelPolicy(hasActiveNote: boolean): PanelPolicy {
  return { sidebarOpen: !hasActiveNote, metadataOpen: false };
}

/** Whether a note activation should dismiss an overlaying tree sheet. */
export function activationClosesSidebar(
  mode: ShellMode,
  sidebarOpen: boolean,
  previousNoteId: string | null,
  nextNoteId: string | null,
): boolean {
  return mode === "compact" && sidebarOpen && nextNoteId !== null && nextNoteId !== previousNoteId;
}
