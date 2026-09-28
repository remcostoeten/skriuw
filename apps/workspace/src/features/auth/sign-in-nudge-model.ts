import { noop } from "@skriuw/shared/helpers/noop";

const STORAGE_KEY = "skriuw.sign-in-nudge.v1";
const FIRST_NUDGE_AT = 5;
const NUDGE_INTERVAL = 15;

export type NudgeProgress = {
  actions: number;
  nextAt: number;
};

export type NudgeStep = {
  progress: NudgeProgress;
  due: boolean;
};

const FRESH_PROGRESS: NudgeProgress = { actions: 0, nextAt: FIRST_NUDGE_AT };

/**
 * @name recordNudgeAction
 * @description Counts one meaningful action (a note created, or a different
 * note edited) and reports whether the sign-in drawer is due. The first nudge
 * comes after a handful of actions, then again at a fixed interval, so a
 * visitor who keeps writing without an account is reminded without being
 * nagged on every note.
 *
 * @example
 * const step = recordNudgeAction(readNudgeProgress());
 * rememberNudgeProgress(step.progress);
 * if (step.due) openSignIn();
 */
export function recordNudgeAction(progress: NudgeProgress): NudgeStep {
  const actions = progress.actions + 1;
  if (actions < progress.nextAt) {
    return { progress: { actions, nextAt: progress.nextAt }, due: false };
  }
  return { progress: { actions, nextAt: actions + NUDGE_INTERVAL }, due: true };
}

function parseProgress(raw: string): NudgeProgress | null {
  // "<actions>/<nextAt>", both non-negative integers.
  const match = /^(\d+)\/(\d+)$/.exec(raw);
  if (!match) return null;
  return { actions: Number(match[1]), nextAt: Number(match[2]) };
}

/** Reads this profile's nudge progress; unreadable storage starts fresh. */
export function readNudgeProgress(storage?: Storage): NudgeProgress {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    return (raw === null ? null : parseProgress(raw)) ?? FRESH_PROGRESS;
  } catch {
    noop();
    return FRESH_PROGRESS;
  }
}

/**
 * Stores the progress. A blocked localStorage only restarts the count next
 * launch, so the failure is not surfaced.
 */
export function rememberNudgeProgress(progress: NudgeProgress, storage?: Storage): void {
  try {
    (storage ?? globalThis.localStorage).setItem(
      STORAGE_KEY,
      `${progress.actions}/${progress.nextAt}`,
    );
  } catch {
    noop();
  }
}
