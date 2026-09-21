/* Copy of apps/workspace/src/features/search/search-plan.ts, held identical by __tests__/desktop-parity.test.cts. */

import type { SearchHit } from "@skriuw/renderer-core/contracts/workspace";
import { referenceKey } from "@skriuw/renderer-core/references/types";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { resolveSearchFilters, type SearchFilterResolution } from "./filter-resolution";
import { parseSearchQuery, type ParsedSearchQuery } from "./query-parser";

export const MIN_FULL_TEXT_LENGTH = 2;

const SNIPPET_LENGTH = 96;

export type SearchPlanStatus = "idle" | "blocked" | "ready";

export type WorkspaceSearchPlan = {
  parsed: ParsedSearchQuery;
  resolution: SearchFilterResolution;
  text: string;
  allowedNoteIds: ReadonlySet<string> | null;
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

export function planWorkspaceSearch(
  state: RendererState,
  raw: string,
  limit: number,
): WorkspaceSearchPlan {
  const parsed = parseSearchQuery(raw);
  const resolution = resolveSearchFilters(state, parsed.filters);
  const allowedNoteIds = intersectReferencedNotes(state, resolution);
  const filtered = allowedNoteIds !== null;
  const minimumTextLength = filtered ? 1 : MIN_FULL_TEXT_LENGTH;
  const requiresFullText = parsed.text.length >= minimumTextLength;
  const fullTextLimit = limit;

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
  const matched =
    allowedNoteIds === null ? hits : hits.filter((hit) => allowedNoteIds.has(hit.noteId));
  return matched.slice(0, limit);
}
