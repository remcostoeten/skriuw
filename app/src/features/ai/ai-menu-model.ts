import {
  aiNoteActions,
  aiSelectionActions,
  type AiEditorAction,
} from "./editor-actions";

export type AiMenuRow = {
  action: AiEditorAction;
  /** Section title, on the first row of each group only. */
  heading: string | null;
  /** Why this row cannot run right now, or null when it can. */
  reason: string | null;
};

/**
 * The menu is offered from the caret as well as from a selection, so the
 * selection actions have to stay visible with nothing selected — hiding them
 * would make the menu's contents depend on state the writer cannot see from the
 * menu. They carry the reason they are unavailable instead.
 */
export function aiMenuRows(hasSelection: boolean): readonly AiMenuRow[] {
  const reason = hasSelection ? null : "Select some text first";
  const rows: AiMenuRow[] = aiSelectionActions().map((action, index) => ({
    action,
    heading: index === 0 ? "Selection" : null,
    reason,
  }));
  for (const [index, action] of aiNoteActions().entries()) {
    rows.push({ action, heading: index === 0 ? "This note" : null, reason: null });
  }
  return rows;
}

/**
 * Filtered rows, regrouped under a single heading: once a query has mixed
 * selection and note actions together, the original sections describe an order
 * that is no longer on screen.
 */
export function filterAiMenuRows(
  rows: readonly AiMenuRow[],
  query: string,
): readonly AiMenuRow[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return rows;
  }
  return rows
    .filter((row) =>
      `${row.action.label} ${row.action.keywords.join(" ")}`.toLowerCase().includes(needle),
    )
    .map((row, index) => ({ ...row, heading: index === 0 ? "Matches" : null }));
}

/**
 * Whether picking this row opens the instruction step rather than starting a
 * run. Actions that need nothing from the writer run on the click that chose
 * them: an intermediate confirmation step buys nothing when the result is
 * reviewed before it can touch the note anyway.
 */
export function aiMenuRowNeedsInstruction(row: AiMenuRow): boolean {
  return row.action.instruction !== null;
}

/** How the model behind a run is named in the menu and the run card. */
export function aiModelLabel(
  providerId: string | null,
  modelId: string | null,
): string | null {
  if (providerId === null || modelId === null) {
    return null;
  }
  return `${providerId} · ${modelId}`;
}
