import assert from "node:assert/strict";
import { test } from "vitest";
import {
  appendColdStart,
  COLD_START_BUDGET_MS,
  parseColdStarts,
  summarizeColdStarts,
  type ColdStartSample,
} from "@/features/startup/cold-start";

function sample(elapsedMs: number, at = elapsedMs): ColdStartSample {
  return { elapsedMs, anchor: "process-start", at };
}

test("the history keeps the most recent launches, newest last", () => {
  let samples: ColdStartSample[] = [];
  for (let launch = 1; launch <= 5; launch += 1) {
    samples = appendColdStart(samples, sample(launch * 100), 3);
  }

  assert.deepEqual(
    samples.map((entry) => entry.elapsedMs),
    [300, 400, 500],
  );
});

test("nothing is summarised before a launch was measured", () => {
  assert.equal(summarizeColdStarts([]), null);
});

test("the summary reports the nearest-rank 95th percentile against the budget", () => {
  const twenty = Array.from({ length: 20 }, (_, index) => sample(500 + index * 50, index));
  const summary = summarizeColdStarts(twenty);

  assert.deepEqual(summary, {
    count: 20,
    latestMs: 1450,
    p95Ms: 1400,
    withinBudget: true,
  });

  const slow = summarizeColdStarts([...twenty, sample(COLD_START_BUDGET_MS + 900, 21)]);
  assert.equal(slow?.p95Ms, 1450);
  assert.equal(slow?.latestMs, COLD_START_BUDGET_MS + 900);

  const overBudget = summarizeColdStarts([sample(1600), sample(1700)]);
  assert.equal(overBudget?.withinBudget, false);
});

test("a damaged history file is read as whatever entries are still valid", () => {
  assert.deepEqual(parseColdStarts(""), []);
  assert.deepEqual(parseColdStarts("{not json"), []);
  assert.deepEqual(parseColdStarts('{"elapsedMs":1}'), []);
  assert.deepEqual(
    parseColdStarts(
      JSON.stringify([
        { elapsedMs: 812, anchor: "process-start", at: 1 },
        { elapsedMs: 640, anchor: "app-launch", at: 2 },
        { elapsedMs: 700, anchor: "boot", at: 3 },
        { elapsedMs: "fast", anchor: "process-start", at: 4 },
        null,
      ]),
    ),
    [
      { elapsedMs: 812, anchor: "process-start", at: 1 },
      { elapsedMs: 640, anchor: "app-launch", at: 2 },
    ],
  );
});
