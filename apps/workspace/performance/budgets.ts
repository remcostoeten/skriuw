type TimingBound = {
  p95Ms: number;
  maxMs: number;
};

type FrameMisses = {
  at60Hz: number;
  at120Hz: number;
};

type MeasuredPhase = {
  longAnimationFrames: readonly { blockingDurationMs: number }[];
};

type BudgetRecord = {
  estimatedFrameMs: number;
  capabilities: { longAnimationFrames: boolean };
  selection: MeasuredPhase & {
    summary: { dispatch: TimingBound; editorInstallation: TimingBound };
  };
  workingSet: {
    configuredLimit: number;
    maximumObservedSize: number;
    finalObservedSize: number;
    evictions: number;
    coldRevisitWasEvicted: boolean;
    coldRevisitDispatchMs: number;
    bridgeCalls: readonly string[];
  };
  keyboardSwitches: MeasuredPhase & {
    droppedFrames: number;
    frameMisses: FrameMisses;
  };
  typing: MeasuredPhase & {
    summary: { nextPaint: TimingBound };
  };
  referenceSuggestions: TimingBound & {
    bridgeCalls: readonly string[];
  };
  trace: {
    keyboard: { maxMs: number };
  } | null;
};

export type BudgetStatus = {
  cachedEditorSwap: boolean;
  boundedEditorWorkingSet: boolean;
  coldEditorRevisit: boolean;
  selectionDispatch: boolean;
  keystrokeToPaint: boolean;
  hundredSwitchesDroppedNoFrames: boolean;
  referenceSuggestions: boolean;
  navigationMainThreadTask: boolean | null;
  noBlockingAnimationFrames: boolean | null;
  hundredSwitchesNoFrameMissAt120Hz: boolean | null;
};

const frameBudgetMs = 8;
const frameCeilingMs = 16.67;
const highRefreshFrameLimitMs = 9;

function below(summary: TimingBound, p95Ms: number, maximumMs: number): boolean {
  return summary.p95Ms < p95Ms && summary.maxMs < maximumMs;
}

function hasNoBlockingFrames(phases: readonly MeasuredPhase[]): boolean {
  return phases.every((phase) =>
    phase.longAnimationFrames.every((frame) => frame.blockingDurationMs === 0),
  );
}

/**
 * @name budgetStatus
 * @description Evaluates one harness record against the performance contract budgets.
 * A budget that cannot be measured on the current display or browser is `null`: the 120 Hz
 * budget below 111 Hz, the keydown task budget without a Chrome trace, and the blocking frame
 * budget without Long Animation Frame support.
 * @example
 * record.budgets = budgetStatus(record);
 */
export function budgetStatus(record: BudgetRecord): BudgetStatus {
  const { selection, workingSet, keyboardSwitches, typing, referenceSuggestions } = record;
  return {
    cachedEditorSwap: below(selection.summary.editorInstallation, frameBudgetMs, frameCeilingMs),
    boundedEditorWorkingSet:
      workingSet.maximumObservedSize <= workingSet.configuredLimit &&
      workingSet.finalObservedSize <= workingSet.configuredLimit &&
      workingSet.evictions > 0 &&
      workingSet.coldRevisitWasEvicted === true &&
      workingSet.bridgeCalls.length === 0,
    coldEditorRevisit:
      workingSet.coldRevisitWasEvicted === true && workingSet.coldRevisitDispatchMs < frameBudgetMs,
    selectionDispatch: selection.summary.dispatch.p95Ms < frameBudgetMs,
    keystrokeToPaint: below(typing.summary.nextPaint, frameBudgetMs, frameCeilingMs),
    hundredSwitchesDroppedNoFrames: keyboardSwitches.droppedFrames === 0,
    referenceSuggestions:
      below(referenceSuggestions, frameBudgetMs, frameCeilingMs) &&
      referenceSuggestions.bridgeCalls.length === 0,
    navigationMainThreadTask:
      record.trace === null ? null : record.trace.keyboard.maxMs < frameBudgetMs,
    noBlockingAnimationFrames: record.capabilities.longAnimationFrames
      ? hasNoBlockingFrames([selection, keyboardSwitches, typing])
      : null,
    hundredSwitchesNoFrameMissAt120Hz:
      record.estimatedFrameMs <= highRefreshFrameLimitMs
        ? keyboardSwitches.frameMisses.at120Hz === 0
        : null,
  };
}

/**
 * @name failedBudgets
 * @description Lists the budgets that failed, in declaration order. Unmeasurable budgets
 * (`null`) do not count as failures.
 * @example
 * const failures = failedBudgets(record.budgets);
 */
export function failedBudgets(budgets: BudgetStatus): string[] {
  return Object.entries(budgets)
    .filter(([, passed]) => passed === false)
    .map(([name]) => name);
}

/**
 * @name framesOver
 * @description Counts frame gaps longer than one and a half frames at the given frame duration.
 * @example
 * framesOver(phase.frameGapsMs, 8.33);
 */
export function framesOver(gapsMs: readonly number[], frameMs: number): number {
  return gapsMs.filter((gap) => gap > frameMs * 1.5).length;
}
