import type { AiCompletionRequest } from "@/contracts/ai";
import type { AiEditorAction } from "@/features/ai/actions/editor-actions";
import type { AiActionTarget } from "@/features/ai/actions/editor-action-model";
import { runIsStreaming } from "@/features/ai/actions/editor-action-model";
import type { RunSession } from "./run-session";

export type RegisteredAiRun = {
  action: AiEditorAction;
  target: AiActionTarget;
  request: AiCompletionRequest;
  /** The model the request actually went to, as the card and menu name it. */
  modelLabel: string | null;
  session: RunSession;
};

type Options = {
  /** Aborts when the surface that owns this run is torn down for good. */
  signal: AbortSignal;
  /** Told when a still-streaming run had to be stopped because its owner left. */
  onStopped?: (entry: RegisteredAiRun) => void;
};

const runs = new Map<string, RegisteredAiRun>();
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Runs keyed by the note they were fired against, held outside React so a
 * card can leave the screen with its note and re-attach when the note comes
 * back, while the stream keeps accumulating in the session meanwhile.
 *
 * A note has at most one run: starting another replaces it, exactly as a new
 * card used to replace the old one. Ending a run disposes its session, and an
 * owner's abort ends every run it registered — loudly, through `onStopped`,
 * when the provider was still writing.
 */
export function registerAiRun(entry: RegisteredAiRun, { signal, onStopped }: Options): void {
  const noteId = entry.target.noteId;
  runs.get(noteId)?.session.dispose();
  runs.set(noteId, entry);
  function abandon() {
    if (runs.get(noteId) !== entry) {
      return;
    }
    const streaming = runIsStreaming(entry.session.getRun());
    if (streaming) {
      entry.session.cancel();
    }
    endAiRun(noteId, entry);
    if (streaming) {
      onStopped?.(entry);
    }
  }
  if (signal.aborted) {
    abandon();
    return;
  }
  signal.addEventListener("abort", abandon, { once: true });
  publish();
}

export function aiRunForNote(noteId: string | null): RegisteredAiRun | null {
  return noteId === null ? null : (runs.get(noteId) ?? null);
}

/** Ends the run for a note. With `entry` given, only that exact run is ended. */
export function endAiRun(noteId: string, entry?: RegisteredAiRun): void {
  const current = runs.get(noteId);
  if (current === undefined || (entry !== undefined && current !== entry)) {
    return;
  }
  current.session.dispose();
  runs.delete(noteId);
  publish();
}

export function subscribeAiRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearAiRuns(): void {
  for (const entry of runs.values()) {
    entry.session.dispose();
  }
  runs.clear();
  publish();
}
