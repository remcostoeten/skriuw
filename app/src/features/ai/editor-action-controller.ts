import type { AppCommand } from "@/commands/registry";
import { AI_EDITOR_ACTIONS, type AiEditorAction } from "./editor-actions";
import { guardAiRegistrations } from "./opt-in-gate";

export type AiActionListener = {
  /** Whether this listener's editor currently holds the caret. */
  isFocused: () => boolean;
  open: (actionId: string | null) => void;
};

const listeners: AiActionListener[] = [];
let pending: { actionId: string | null } | null = null;

export function registerAiActionListener(next: AiActionListener): () => void {
  listeners.push(next);
  if (pending !== null) {
    const replay = pending;
    pending = null;
    requestAiAction(replay.actionId);
  }
  return () => {
    const index = listeners.indexOf(next);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * The editor that should answer a request. With a split open, both panes have a
 * listener, so the one holding the caret wins; the most recently mounted pane
 * is the fallback when focus has moved to the palette or a menu.
 */
function activeListener(): AiActionListener | null {
  return (
    listeners.find((listener) => listener.isFocused()) ??
    listeners[listeners.length - 1] ??
    null
  );
}

/**
 * Opens an editor AI surface. A null action id opens the picker for the current
 * selection. Requests made before a host mounts are queued and replayed once
 * one registers, so the first invocation after the gate turns on is not lost to
 * a lazy chunk still loading.
 */
export function requestAiAction(actionId: string | null): void {
  const listener = activeListener();
  if (listener === null) {
    pending = { actionId };
    return;
  }
  listener.open(actionId);
}

/** Drops a queued request when the gate closes before the host ever mounted. */
export function clearPendingAiAction(): void {
  pending = null;
}

function actionCommand(action: AiEditorAction): AppCommand {
  return {
    id: `ai-action-${action.id}`,
    label: `AI: ${action.label}`,
    group: "AI",
    keywords: ["ai", action.scope === "selection" ? "selection" : "note", ...action.keywords],
    enabled: (state, ui) => ui.route === "notes" && state.activeNoteId !== null,
    run: () => requestAiAction(action.id),
  };
}

/**
 * Every action as its own palette entry, plus the picker. Selection actions
 * refuse with an actionable message when nothing is selected rather than
 * disappearing, because the palette cannot see the editor's selection without
 * pushing transient editor state into the store.
 */
export function aiEditorActionCommands(enabled: boolean): readonly AppCommand[] {
  return guardAiRegistrations(enabled, () => [
    {
      id: "ai-actions",
      label: "AI: Ask about the selection",
      group: "AI",
      keywords: ["ai", "rewrite", "translate", "summarize", "assistant", "actions"],
      enabled: (state, ui) => ui.route === "notes" && state.activeNoteId !== null,
      run: () => requestAiAction(null),
    },
    ...AI_EDITOR_ACTIONS.map(actionCommand),
  ]);
}
