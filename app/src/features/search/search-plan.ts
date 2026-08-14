import type { SearchHit } from "@/contracts/workspace";
import { referenceKey } from "@/features/references/types";
import type { RendererState } from "@/store/types";
import { resolveSearchFilters, type SearchFilterResolution } from "./filter-resolution";
import { parseSearchQuery, type ParsedSearchQuery } from "./query-parser";

/**
 * Shortest free-text query handed to full-text search when nothing narrows it.
 * A filtered query bypasses this: its candidate set is already bounded by the
 * reference projection, so a single character is cheap enough to run.
 */
export const MIN_FULL_TEXT_LENGTH = 2;

/**
 * Full-text search ranks by bm25 across the whole workspace and knows nothing
 * about tags or people, so a filtered query has to over-fetch and intersect.
 * A note matching the filter but ranking below this many rows for the free
 * text will not appear; the bound is deliberate and measurable rather than an
 * operator pushed down into renderer-authored SQL.
 */
const FILTERED_FETCH_MULTIPLIER = 25;
const FILTERED_FETCH_MINIMUM = 200;

const SNIPPET_LENGTH = 96;

export type SearchPlanStatus = "idle" | "blocked" | "ready";

export type WorkspaceSearchPlan = {
  parsed: ParsedSearchQuery;
  resolution: SearchFilterResolution;
  /** Free text handed to full-text search, with every operator removed. */
  text: string;
  /**
   * Note ids the resolved filters allow through, or null when no filter
   * narrows the query. Already excludes trashed and otherwise unavailable
   * notes, matching the backend's own exclusion.
   */
  allowedNoteIds: ReadonlySet<string> | null;
  /** Rows to request from full-text search; over-fetches when filtered. */
  fullTextLimit: number;
  requiresFullText: boolean;
  status: SearchPlanStatus;
};

function intersectReferencedNotes(
  state: RendererState,
  resolution: SearchFilterResolution,
): ReadonlySet<string> | null {
  if (resolution.resolved.length === 0) {
    return null;
  }
  const sourceLists = resolution.resolved.map(
    (filter) => state.incomingReferences.get(referenceKey(filter.kind, filter.targetId)) ?? [],
  );
  sourceLists.sort((left, right) => left.length - right.length);
  const [smallest, ...rest] = sourceLists;
  const allowed = new Set<string>();
  for (const noteId of smallest ?? []) {
    if (!state.nodes.has(noteId)) {
      continue;
    }
    if (rest.every((sources) => sources.includes(noteId))) {
      allowed.add(noteId);
    }
  }
  return allowed;
}

export function planWorkspaceSearch(state: RendererState, raw: string, limit: number): WorkspaceSearchPlan {
  const parsed = parseSearchQuery(raw);
  const resolution = resolveSearchFilters(state, parsed.filters);
  const allowedNoteIds = intersectReferencedNotes(state, resolution);
  const filtered = allowedNoteIds !== null;
  const minimumTextLength = filtered ? 1 : MIN_FULL_TEXT_LENGTH;
  const requiresFullText = parsed.text.length >= minimumTextLength;
  const fullTextLimit = filtered
    ? Math.max(limit * FILTERED_FETCH_MULTIPLIER, FILTERED_FETCH_MINIMUM)
    : limit;

  let status: SearchPlanStatus = "ready";
  if (resolution.problems.length > 0) {
    status = "blocked";
  } else if (!filtered && !requiresFullText) {
    status = "idle";
  }

  return {
    parsed,
    resolution,
    text: parsed.text,
    allowedNoteIds,
    fullTextLimit,
    requiresFullText: status === "ready" && requiresFullText,
    status,
  };
}

function snippetFor(state: RendererState, noteId: string): string {
  const markdown = state.documents.get(noteId)?.markdown ?? "";
  const flattened = markdown.replace(/\s+/g, " ").trim();
  if (flattened.length <= SNIPPET_LENGTH) {
    return flattened;
  }
  return `${flattened.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}

/**
 * Results for a filter-only query (`#design $ada`), which has no free text for
 * full-text search to rank. Ordered most recently updated first so the list
 * reads like the workspace, with title and id as deterministic tie-breaks.
 */
function projectFilteredNotes(
  state: RendererState,
  allowedNoteIds: ReadonlySet<string>,
  limit: number,
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const noteId of allowedNoteIds) {
    const metadata = state.metadata.get(noteId);
    if (!metadata) {
      continue;
    }
    hits.push({ noteId, title: metadata.title, snippet: snippetFor(state, noteId), score: 0 });
  }
  hits.sort((left, right) => {
    const leftUpdated = state.metadata.get(left.noteId)?.updatedAt ?? 0;
    const rightUpdated = state.metadata.get(right.noteId)?.updatedAt ?? 0;
    return (
      rightUpdated - leftUpdated ||
      left.title.localeCompare(right.title) ||
      left.noteId.localeCompare(right.noteId)
    );
  });
  return hits.slice(0, limit);
}

/**
 * Final result list for a plan. Full-text hits are intersected with the
 * reference projection; a filter-only plan is projected straight from hydrated
 * state. A blocked plan yields nothing, because acting on an unknown or
 * ambiguous name would answer a question the user did not ask.
 */
export function applySearchPlan(
  state: RendererState,
  plan: WorkspaceSearchPlan,
  hits: readonly SearchHit[],
  limit: number,
): readonly SearchHit[] {
  if (plan.status !== "ready") {
    return [];
  }
  const { allowedNoteIds } = plan;
  if (!plan.requiresFullText) {
    return allowedNoteIds === null ? [] : projectFilteredNotes(state, allowedNoteIds, limit);
  }
  const matched = allowedNoteIds === null ? hits : hits.filter((hit) => allowedNoteIds.has(hit.noteId));
  return matched.slice(0, limit);
}
