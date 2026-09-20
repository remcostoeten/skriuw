import type { SearchHit } from "../../../../../shared/renderer-core/src/contracts/workspace";
import type { RendererState } from "../../../../../shared/renderer-core/src/store/types";
import { describeSearchFilterProblem } from "../query/filter-resolution";
import { applySearchPlan, planWorkspaceSearch, type SearchPlanStatus } from "../query/search-plan";

export const SEARCH_RESULT_LIMIT = 50;

export type SearchOutcome = {
  query: string;
  status: SearchPlanStatus;
  hits: readonly SearchHit[];
  problems: readonly string[];
  elapsedMs: number;
};

export type SearchRunnerPorts = {
  getState: () => RendererState;
  search: (
    query: string,
    limit: number,
    noteIds: readonly string[] | null,
  ) => Promise<readonly SearchHit[]>;
  now?: () => number;
  onSample?: (elapsedMs: number) => void;
};

export type SearchRunner = {
  run: (query: string) => Promise<SearchOutcome | null>;
};

function problemLines(plan: ReturnType<typeof planWorkspaceSearch>): readonly string[] {
  return plan.resolution.problems.map(describeSearchFilterProblem);
}

export function createSearchRunner(ports: SearchRunnerPorts): SearchRunner {
  const now = ports.now ?? (() => Date.now());
  let token = 0;

  return {
    async run(query) {
      const ticket = ++token;
      const startedAt = now();
      const plan = planWorkspaceSearch(ports.getState(), query, SEARCH_RESULT_LIMIT);

      function settle(hits: readonly SearchHit[]): SearchOutcome | null {
        if (ticket !== token) {
          return null;
        }
        const elapsedMs = now() - startedAt;
        ports.onSample?.(elapsedMs);
        return {
          query,
          status: plan.status,
          hits: applySearchPlan(ports.getState(), plan, hits, SEARCH_RESULT_LIMIT),
          problems: problemLines(plan),
          elapsedMs,
        };
      }

      if (!plan.requiresFullText) {
        return settle([]);
      }
      const allowed = plan.allowedNoteIds === null ? null : [...plan.allowedNoteIds];
      const hits = await ports.search(plan.text, plan.fullTextLimit, allowed);
      return settle(hits);
    },
  };
}

export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) {
    return null;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}
