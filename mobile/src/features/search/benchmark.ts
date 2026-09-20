import type { BridgePort } from "../../../../shared/renderer-core/src/bridge/port";
import type { RendererStore } from "../../../../shared/renderer-core/src/store/types";
import { createSearchRunner, percentile, type SearchOutcome } from "./search-runner";

/**
 * The queries the benchmark times: free text, an operator-bounded query, a
 * filter-only query that never reaches storage, and the intersection of two
 * operators. Between them they cover every path `planWorkspaceSearch` takes.
 */
export const BENCHMARK_QUERIES: readonly string[] = [
  "index rebuild",
  "durable write path",
  "#mobile fixture note",
  "#search",
  "#architecture $\"Ada Lovelace\"",
  "fixture note",
];

/**
 * Ceiling for query-to-results on a development host against the in-memory
 * adapter. It is a regression guard, not the device budget: the reference
 * Android number is recorded by the emulator run in `e2e/`.
 */
export const QUERY_LATENCY_CEILING_MS = 500;

export type QueryLatencyOptions = {
  store: RendererStore;
  bridge: BridgePort;
  /** Times every query this many times; the first round warms nothing else. */
  rounds?: number;
  now?: () => number;
};

export type QueryLatencyReport = {
  samples: readonly number[];
  p50: number | null;
  p95: number | null;
  max: number | null;
  /** One outcome per query, from the last round. */
  outcomes: readonly SearchOutcome[];
};

/**
 * Times query-to-results end to end: plan, backend command, and the filter
 * intersection the surface renders. Used by the unit gate on the host and by
 * the emulator probe on a device, so both report the same number.
 */
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
