import type { AiProviderError, AiRecoveryAction } from "@/contracts/ai";
import type { AiActionRun } from "./editor-action-model";

export type AiRunStepId = "send" | "answer" | "write";

/**
 * `stopped` is not a failure: the writer ended the run, and the step it ended
 * has neither succeeded nor gone wrong. Painting it red would blame the
 * provider for something the writer chose.
 */
export type AiRunStepState = "pending" | "active" | "done" | "failed" | "stopped";

export type AiRunStep = {
  id: AiRunStepId;
  label: string;
  state: AiRunStepState;
};

const STEP_ORDER: readonly AiRunStepId[] = ["send", "answer", "write"];

function stepLabels(providerLabel: string | null): Record<AiRunStepId, string> {
  return {
    send: providerLabel === null ? "Sending the request" : `Sending to ${providerLabel}`,
    answer: "Waiting for the model",
    write: "Writing the result",
  };
}

/**
 * How far a run reached, as the writer sees it. A run that is finished has no
 * active step; a run that failed marks the step it failed in, so "the provider
 * never answered" and "the provider stopped halfway through" are different
 * pictures rather than the same red banner.
 */
function reachedIndex(run: AiActionRun): number {
  if (run.stage === "generating") {
    return 2;
  }
  if (run.stage === "waiting") {
    return 1;
  }
  if (run.stage === "settled") {
    return run.preview.length > 0 ? 2 : 1;
  }
  return 0;
}

export function aiRunSteps(
  run: AiActionRun,
  providerLabel: string | null,
): readonly AiRunStep[] {
  const labels = stepLabels(providerLabel);
  if (run.phase === "composing") {
    return STEP_ORDER.map((id) => ({ id, label: labels[id], state: "pending" as const }));
  }
  const reached = reachedIndex(run);
  const live = run.phase === "streaming";
  const terminalState: AiRunStepState =
    run.phase === "done" ? "done" : run.phase === "cancelled" ? "stopped" : "failed";

  return STEP_ORDER.map((id, index) => {
    if (index < reached) {
      return { id, label: labels[id], state: "done" as const };
    }
    if (index > reached) {
      return { id, label: labels[id], state: "pending" as const };
    }
    return { id, label: labels[id], state: live ? "active" : terminalState };
  });
}

/** Whether the run is still worth showing a stop button for. */
export function aiRunIsAbortable(run: AiActionRun): boolean {
  return run.phase === "streaming";
}

const RECOVERY_HINTS: Record<AiRecoveryAction, string | null> = {
  configure_credential: "Add or fix this provider's API key in AI settings.",
  retry: "Try again — this one usually clears on a second run.",
  choose_different_model: "Pick a different model and run it again.",
  check_provider_status: "The provider is having trouble. Check its status page.",
  reduce_request: "Send a smaller selection, or shorten the note.",
  contact_provider: "This needs the provider's support to unblock.",
  none: null,
};

/** The one concrete next move a failure leaves the writer, or null when there is none. */
export function aiErrorHint(error: AiProviderError | null): string | null {
  return error === null ? null : RECOVERY_HINTS[error.recoveryAction];
}

/**
 * Elapsed run time, in whole tenths under ten seconds and whole seconds after.
 * A run that has not started has no duration to report.
 */
export function aiRunElapsedLabel(startedAt: number | null, now: number): string | null {
  if (startedAt === null) {
    return null;
  }
  const seconds = Math.max(0, (now - startedAt) / 1000);
  if (seconds < 1) {
    return null;
  }
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

/** How long a silent stream waits before the card says so out loud. */
export const AI_RUN_STALL_MS = 6000;

/**
 * A run that has been quiet long enough to be worth remarking on, with the
 * reason it is quiet. Null while the run is behaving.
 */
export function aiRunStallNote(run: AiActionRun, now: number): string | null {
  if (run.phase !== "streaming" || run.startedAt === null) {
    return null;
  }
  if (now - run.startedAt < AI_RUN_STALL_MS) {
    return null;
  }
  if (run.stage === "sending") {
    return "Still opening the stream. A local model loading for the first time can take a while.";
  }
  if (run.stage === "waiting") {
    return "The stream is open but the model has not written anything yet.";
  }
  return null;
}
