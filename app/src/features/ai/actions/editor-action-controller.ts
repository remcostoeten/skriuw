import type { AppCommand } from "@/commands/registry";
import { AI_EDITOR_ACTIONS, aiEditorAction, type AiEditorAction } from "./editor-actions";
import { guardAiRegistrations } from "@/features/ai/opt-in-gate";

type Props = {
  /** Whether this listener's editor currently holds the caret. */
  isFocused: () => boolean;
  open: (actionId: string | null) => void;
  /** Starts the action outright, answering any refusal in the menu. */
  repeat: (action: AiEditorAction, instruction: string) => void;
};

export type LastAiAction = {
  actionId: string;
  instruction: string;
};

const listeners: Props[] = [];
let pending: { actionId: string | null } | null = null;
let lastAction: LastAiAction | null = null;

export function registerAiActionListener(next: Props): () => void {
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
function activeListener(): Props | null {
  return (
    listeners.find((listener) => listener.isFocused()) ??
    listeners[listeners.length - 1] ??
    null
  );
}

/**
 * Opens an editor AI surface. A null action id opens the menu on its action
 * list; a named one opens it on that action's instruction step, or starts the
 * run outright when the action asks for nothing. Requests made before a host
 * mounts are queued and replayed once one registers, so the first invocation
 * after the gate turns on is not lost to a lazy chunk still loading.
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

/**
 * What ran last, kept here rather than in the store: it is interaction state
 * for this session, not workspace state, and it must not survive a restart or
 * reach another device.
 */
export function rememberAiAction(actionId: string, instruction: string): void {
  lastAction = { actionId, instruction };
}

export function lastAiAction(): LastAiAction | null {
  return lastAction;
}

export function clearLastAiAction(): void {
  lastAction = null;
}

/**
 * Re-runs the last action against whatever is under the caret now. Returns
 * false when there is nothing to repeat or no editor to repeat it in; a
 * selection action with no selection is refused by the host, in the menu, with
 * the same message the menu gives.
 */
export function requestAiRepeat(): boolean {
  const remembered = lastAction;
  if (remembered === null) {
    return false;
  }
  const action = aiEditorAction(remembered.actionId);
  const listener = activeListener();
  if (action === null || listener === null) {
    return false;
  }
  listener.repeat(action, remembered.instruction);
  return true;
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
 * Every action as its own palette entry, plus the menu itself. Selection
 * actions stay listed with nothing selected and refuse with an actionable
 * message, because the palette cannot see the editor's selection without
 * pushing transient editor state into the store.
 */
export function aiEditorActionCommands(enabled: boolean): readonly AppCommand[] {
  return guardAiRegistrations(enabled, () => [
    {
      id: "ai-actions",
      label: "AI: Ask AI",
      group: "AI",
      keywords: ["ai", "rewrite", "translate", "summarize", "assistant", "actions"],
      enabled: (state, ui) => ui.route === "notes" && state.activeNoteId !== null,
      run: () => requestAiAction(null),
    },
    ...AI_EDITOR_ACTIONS.map(actionCommand),
  ]);
}
