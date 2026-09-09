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
 * How far a live run has actually got. `phase` says whether a run is in flight;
 * this says what it is doing, which is the difference between "nothing is
 * happening" and "the provider has not answered yet" — the two a writer staring
 * at an unchanged note cannot otherwise tell apart.
 *
 * `sending` covers the round trip that opens the stream, which is where a cold
 * local model spends most of a slow run. `waiting` is an open stream that has
 * produced no token yet. `generating` starts at the first delta.
 */
export type AiRunStage = "idle" | "sending" | "waiting" | "generating" | "settled";

/**
 * Streamed output lives here and nowhere else until the writer accepts it. The
 * canonical document is never a stream target, so cancelling at any point
 * leaves the note byte-for-byte as it was.
 */
export type AiActionRun = {
  phase: AiActionPhase;
  stage: AiRunStage;
  requestId: string | null;
  preview: string;
  error: AiProviderError | null;
  /** `performance.now()` at the moment the request was fired, for elapsed time. */
  startedAt: number | null;
};

export const IDLE_RUN: AiActionRun = {
  phase: "composing",
  stage: "idle",
  requestId: null,
  preview: "",
  error: null,
  startedAt: null,
};

export function startedRun(requestId: string, startedAt = 0): AiActionRun {
  return {
    phase: "streaming",
    stage: "sending",
    requestId,
    preview: "",
    error: null,
    startedAt,
  };
}

/**
 * The stream is open but silent. Reached when the provider accepted the request
 * and has not produced a token, so a stalled run says which half it is stuck in.
 */
export function connectedRun(run: AiActionRun, requestId: string): AiActionRun {
  if (run.phase !== "streaming" || run.requestId !== requestId || run.stage !== "sending") {
    return run;
  }
  return { ...run, stage: "waiting" };
}

/**
 * Stopping is answered locally rather than waited for. The provider is asked to
 * cancel too, but its acknowledgement may never arrive — and the note is
 * untouched either way, so there is nothing to be careful about: the writer
 * pressed stop and the run is over.
 */
export function stoppedRun(run: AiActionRun): AiActionRun {
  if (run.phase !== "streaming") {
    return run;
  }
  return { ...run, phase: "cancelled", stage: "settled" };
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
  return { ...run, stage: "generating", preview: run.preview + text };
}

export function runWithTerminal(
  run: AiActionRun,
  event: Exclude<AiCompletionEvent, { type: "delta" }>,
): AiActionRun {
  if (run.phase !== "streaming" || run.requestId !== event.requestId) {
    return run;
  }
  const settled = { ...run, stage: "settled" as const };
  if (event.type === "done") {
    return { ...settled, phase: "done" };
  }
  if (event.type === "cancelled") {
    return { ...settled, phase: "cancelled" };
  }
  if (event.type === "timeout") {
    return { ...settled, phase: "timeout" };
  }
  return { ...settled, phase: "error", error: event.error };
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
    stage: "settled",
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
    if (run.stage === "sending") {
      return `${action.label} is running. Sending the request.`;
    }
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
