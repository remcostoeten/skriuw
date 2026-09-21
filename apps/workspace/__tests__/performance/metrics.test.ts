import assert from "node:assert/strict";
import test from "node:test";
import { summarize } from "../../performance/metrics";

test("performance summaries retain nearest-rank percentiles and maximum", () => {
  const samples = Array.from({ length: 100 }, (_, index) => index + 1).reverse();
  assert.deepEqual(summarize(samples), {
    p50Ms: 50,
    p95Ms: 95,
    p99Ms: 99,
    maxMs: 100,
  });
});

test("performance summaries are explicit for empty samples", () => {
  assert.deepEqual(summarize([]), {
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    maxMs: 0,
  });
});
