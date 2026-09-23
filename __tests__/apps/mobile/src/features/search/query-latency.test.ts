import assert from "node:assert/strict";
import { test } from "vitest";
import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { FIXTURE_NOTE_COUNT, thousandNoteSnapshot } from "@/features/search/benchmark/fixture";
import {
  BENCHMARK_QUERIES,
  QUERY_LATENCY_CEILING_MS,
  measureQueryLatency,
} from "@/features/search/benchmark/benchmark";

test("the fixture is the workspace the benchmark claims to measure", () => {
  const snapshot = thousandNoteSnapshot();
  assert.equal(snapshot.documents.length, FIXTURE_NOTE_COUNT);
  assert.equal(snapshot.nodes.filter((node) => node.kind === "note").length, FIXTURE_NOTE_COUNT);
  assert.ok(snapshot.tags.length > 0);
  assert.ok(snapshot.people.length > 0);
});

test("query to results over 1,000 notes stays inside the host ceiling", async () => {
  const snapshot = thousandNoteSnapshot();
  const store = createRendererStore(
    createInitialState(snapshot, undefined, {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
  const bridge = createMemoryBridge({ snapshot });

  const report = await measureQueryLatency({ store, bridge, rounds: 5 });

  console.log(
    `query-to-results over ${FIXTURE_NOTE_COUNT} notes (host, memory adapter): ` +
      `samples=${report.samples.length} p50=${report.p50?.toFixed(1)}ms ` +
      `p95=${report.p95?.toFixed(1)}ms max=${report.max?.toFixed(1)}ms`,
  );

  assert.equal(report.samples.length, BENCHMARK_QUERIES.length * 5);
  assert.ok(report.p95 !== null);
  assert.ok(
    report.p95 < QUERY_LATENCY_CEILING_MS,
    `p95 ${report.p95}ms exceeded the ${QUERY_LATENCY_CEILING_MS}ms ceiling`,
  );
});

test("every benchmark query answers something, so the measurement is not of an empty scan", async () => {
  const snapshot = thousandNoteSnapshot();
  const store = createRendererStore(
    createInitialState(snapshot, undefined, {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
  const bridge = createMemoryBridge({ snapshot });

  const report = await measureQueryLatency({ store, bridge, rounds: 1 });

  for (const outcome of report.outcomes) {
    assert.equal(outcome.status, "ready", `${outcome.query} did not plan`);
    assert.ok(outcome.hits.length > 0, `${outcome.query} matched nothing`);
  }
});
