import type { SearchHit } from "../../../../shared/renderer-core/src/contracts/workspace";
import type { RendererState } from "../../../../shared/renderer-core/src/store/types";
import { describeSearchFilterProblem } from "./filter-resolution";
import { applySearchPlan, planWorkspaceSearch, type SearchPlanStatus } from "./search-plan";

/** Results one screen of the list can show before a narrower query is the better answer. */
export const SEARCH_RESULT_LIMIT = 50;

export type SearchOutcome = {
  /** The query this outcome answers, so a view can drop one the field has moved past. */
  query: string;
  status: SearchPlanStatus;
  hits: readonly SearchHit[];
  /** One line per filter that named nothing or named more than one entity. */
  problems: readonly string[];
  /** Wall time from `run` to the resolved outcome. */
  elapsedMs: number;
};

export type SearchRunnerPorts = {
  getState: () => RendererState;
  /** The backend search command; ranking belongs to it and is never recomputed here. */
  search: (
    query: string,
    limit: number,
    noteIds: readonly string[] | null,
  ) => Promise<readonly SearchHit[]>;
  now?: () => number;
  onSample?: (elapsedMs: number) => void;
};

export type SearchRunner = {
  /**
   * Answers one query. Resolves to `null` when a later `run` already started,
   * so a slow response can never overwrite a newer one.
   */
  run: (query: string) => Promise<SearchOutcome | null>;
};

function problemLines(plan: ReturnType<typeof planWorkspaceSearch>): readonly string[] {
  return plan.resolution.problems.map(describeSearchFilterProblem);
}

/**
 * Runs workspace search for one surface. The plan resolves operators against
 * the hydrated store and bounds the candidate set; the free text goes to the
 * backend command, which ranks it. A filter-only query never reaches the
 * backend because there is nothing to rank, and an unresolved filter answers
 * with its problem rather than with the results of a different question.
 */
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

/** The `p`th percentile of `samples` by nearest rank; `null` for no samples. */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) {
    return null;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}
