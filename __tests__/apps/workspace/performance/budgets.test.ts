import assert from "node:assert/strict";
import { test } from "vitest";
import {
  budgetStatus,
  failedBudgets,
  framesOver,
} from "../../../../apps/workspace/performance/budgets";

function passingRecord() {
  return {
    estimatedFrameMs: 8.33,
    selection: {
      summary: {
        dispatch: { p95Ms: 4.2, maxMs: 7.5 },
        editorInstallation: { p95Ms: 1.8, maxMs: 4.6 },
      },
      longAnimationFrames: [],
    },
    workingSet: {
      configuredLimit: 8,
      maximumObservedSize: 8,
      finalObservedSize: 8,
      evictions: 4,
      coldRevisitWasEvicted: true,
      coldRevisitDispatchMs: 3.1,
      bridgeCalls: [],
    },
    keyboardSwitches: {
      droppedFrames: 0,
      frameMisses: { at60Hz: 0, at120Hz: 0 },
      longAnimationFrames: [],
    },
    typing: {
      summary: { nextPaint: { p95Ms: 7, maxMs: 7.1 } },
      longAnimationFrames: [],
    },
    referenceSuggestions: { p95Ms: 0.4, maxMs: 1.2, bridgeCalls: [] },
    trace: { keyboard: { maxMs: 3.7 } },
  };
}

test("a record inside every budget passes all of them", () => {
  const budgets = budgetStatus(passingRecord());
  assert.ok(Object.values(budgets).every((passed) => passed === true));
  assert.deepEqual(failedBudgets(budgets), []);
});

test("a slow selection dispatch fails only the selection budget", () => {
  const record = passingRecord();
  record.selection.summary.dispatch.p95Ms = 13.8;
  assert.deepEqual(failedBudgets(budgetStatus(record)), ["selectionDispatch"]);
});

test("a navigation keydown task above 8 ms fails the main-thread budget", () => {
  const record = passingRecord();
  record.trace.keyboard.maxMs = 13.5;
  const budgets = budgetStatus(record);
  assert.equal(budgets.navigationMainThreadTask, false);
  assert.deepEqual(failedBudgets(budgets), ["navigationMainThreadTask"]);
});

test("a blocking long animation frame while typing fails the animation frame budget", () => {
  const record = passingRecord();
  const typing = {
    ...record.typing,
    longAnimationFrames: [{ blockingDurationMs: 12 }],
  };
  const budgets = budgetStatus({ ...record, typing });
  assert.equal(budgets.noBlockingAnimationFrames, false);
  assert.deepEqual(failedBudgets(budgets), ["noBlockingAnimationFrames"]);
});

test("frame misses count gaps above one and a half frames", () => {
  assert.equal(framesOver([8, 9, 13, 17, 26], 8.33), 3);
  assert.equal(framesOver([8, 9, 13, 17, 26], 16.67), 1);
});

test("the 120 Hz budget is not measurable on a 60 Hz display and does not fail", () => {
  const record = passingRecord();
  record.estimatedFrameMs = 16.67;
  record.keyboardSwitches.frameMisses.at120Hz = 12;
  const budgets = budgetStatus(record);
  assert.equal(budgets.hundredSwitchesNoFrameMissAt120Hz, null);
  assert.deepEqual(failedBudgets(budgets), []);
});
