import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { createSearchRunner, percentile, type SearchOutcome } from "../run/search-runner";

export const BENCHMARK_QUERIES: readonly string[] = [
  "index rebuild",
  "durable write path",
  "#mobile fixture note",
  "#search",
  "#architecture $\"Ada Lovelace\"",
  "fixture note",
];

export const QUERY_LATENCY_CEILING_MS = 500;

export type QueryLatencyOptions = {
  store: RendererStore;
  bridge: BridgePort;
  rounds?: number;
  now?: () => number;
};

export type QueryLatencyReport = {
  samples: readonly number[];
  p50: number | null;
  p95: number | null;
  max: number | null;
  outcomes: readonly SearchOutcome[];
};

export async function measureQueryLatency(
  options: QueryLatencyOptions,
): Promise<QueryLatencyReport> {
  const rounds = options.rounds ?? 5;
  const samples: number[] = [];
  const outcomes: SearchOutcome[] = [];
  const runner = createSearchRunner({
    getState: () => options.store.getState(),
    search: (query, limit, noteIds) => options.bridge.searchWorkspace(query, limit, noteIds),
    ...(options.now === undefined ? {} : { now: options.now }),
    onSample: (elapsedMs) => samples.push(elapsedMs),
  });

  for (let round = 0; round < rounds; round += 1) {
    outcomes.length = 0;
    for (const query of BENCHMARK_QUERIES) {
      const outcome = await runner.run(query);
      if (outcome !== null) {
        outcomes.push(outcome);
      }
    }
  }

  return {
    samples,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: samples.length === 0 ? null : Math.max(...samples),
    outcomes,
  };
}
