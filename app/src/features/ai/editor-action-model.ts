import type { AiCompletionEvent, AiProviderError } from "@/contracts/ai";
import type { AiEditorAction } from "./editor-actions";

/**
 * The document range an action was fired against, captured before any text
 * leaves the device. Applying a result checks this back against the live
 * editor, so a run that finishes after the writer navigated or kept typing is
 * refused instead of overwriting a range that no longer means what it did.
 */
export type AiActionTarget = {
  noteId: string;
  from: number;
  to: number;
  input: string;
};

export type AiActionPhase =
  | "composing"
  | "streaming"
  | "done"
  | "cancelled"
  | "timeout"
  | "error";

/**
 * Streamed output lives here and nowhere else until the writer accepts it. The
 * canonical document is never a stream target, so cancelling at any point
 * leaves the note byte-for-byte as it was.
 */
export type AiActionRun = {
  phase: AiActionPhase;
  requestId: string | null;
  preview: string;
  error: AiProviderError | null;
};

export const IDLE_RUN: AiActionRun = {
  phase: "composing",
  requestId: null,
  preview: "",
  error: null,
};

export function startedRun(requestId: string): AiActionRun {
  return { phase: "streaming", requestId, preview: "", error: null };
}

/**
 * Deltas belonging to any request other than the live one are dropped: a fake
 * or slow provider can deliver a queued chunk after the writer already started
 * a second run.
 */
export function runWithDelta(
  run: AiActionRun,
  requestId: string,
  text: string,
): AiActionRun {
  if (run.phase !== "streaming" || run.requestId !== requestId) {
    return run;
  }
  return { ...run, preview: run.preview + text };
}

export function runWithTerminal(
  run: AiActionRun,
  event: Exclude<AiCompletionEvent, { type: "delta" }>,
): AiActionRun {
  if (run.phase !== "streaming" || run.requestId !== event.requestId) {
    return run;
  }
  if (event.type === "done") {
    return { ...run, phase: "done" };
  }
  if (event.type === "cancelled") {
    return { ...run, phase: "cancelled" };
  }
  if (event.type === "timeout") {
    return { ...run, phase: "timeout" };
  }
  return { ...run, phase: "error", error: event.error };
}

export function failedRun(
  run: AiActionRun,
  requestId: string,
  message: string,
): AiActionRun {
  if (run.requestId !== requestId) {
    return run;
  }
  return {
    ...run,
    phase: "error",
    error: {
      providerId: "editor",
      category: "internal_failure",
      message,
      recoveryAction: "retry",
    },
  };
}

export function runIsStreaming(run: AiActionRun): boolean {
  return run.phase === "streaming";
}

/** A finished run whose text is worth offering. Empty output is not. */
export function runHasResult(run: AiActionRun): boolean {
  return run.phase === "done" && run.preview.trim().length > 0;
}

export function canRetryRun(run: AiActionRun): boolean {
  return run.phase !== "streaming" && run.phase !== "composing";
}

/**
 * The line a screen reader announces through the live region. It reports
 * progress in bytes rather than characters so the bound the seam enforces and
 * the number a writer sees are the same quantity.
 */
export function aiActionStatusLine(run: AiActionRun, action: AiEditorAction): string {
  if (run.phase === "composing") {
    return `${action.label} is ready to run.`;
  }
  if (run.phase === "streaming") {
    return run.preview.length === 0
      ? `${action.label} is running. Waiting for the first words.`
      : `${action.label} is streaming: ${run.preview.length} characters so far.`;
  }
  if (run.phase === "cancelled") {
    return `${action.label} was cancelled. The note is unchanged.`;
  }
  if (run.phase === "timeout") {
    return `${action.label} timed out. The note is unchanged.`;
  }
  if (run.phase === "error") {
    return `${action.label} failed: ${run.error?.message ?? "the provider stopped."}`;
  }
  if (run.preview.trim().length === 0) {
    return `${action.label} finished without producing any text.`;
  }
  return `${action.label} finished: ${run.preview.length} characters ready to review.`;
}

/**
 * Whether the run's result may still touch the document. Returns the reason it
 * may not, so a stale result explains itself instead of silently doing nothing.
 */
export function applyRefusal(
  target: AiActionTarget,
  currentNoteId: string | null,
  currentInput: string | null,
): string | null {
  if (currentNoteId === null) {
    return "No note is open. Open the note again and re-run the action.";
  }
  if (currentNoteId !== target.noteId) {
    return "This ran on a different note. Go back to that note, or run the action again here.";
  }
  if (currentInput === null) {
    return "That part of the note is gone. Run the action again.";
  }
  if (currentInput !== target.input) {
    return "The note changed while this ran. Run the action again so it works on the current text.";
  }
  return null;
}
