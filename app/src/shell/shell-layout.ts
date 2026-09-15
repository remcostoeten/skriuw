/**
 * Below this width the three-column shell has nowhere to put a second panel:
 * the rail, tree and editor already exceed a phone, and the metadata panel
 * lands off screen. Compact mode replaces the rail with a tab bar and moves
 * both side panels into sheets that overlay the editor.
 */
export const COMPACT_SHELL_QUERY = "(max-width: 767px)";

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
