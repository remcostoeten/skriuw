import type { RendererState } from "@/store/types";
import { normalizeEntityName, type SearchFilter, type SearchFilterKind } from "./query-parser";

export type SearchFilterCandidate = {
  id: string;
  label: string;
};

export type ResolvedSearchFilter = {
  kind: SearchFilterKind;
  /** Name as typed. */
  name: string;
  targetId: string;
  /** Stored name of the resolved entity, which may differ in case. */
  label: string;
};

export type SearchFilterProblem = {
  kind: SearchFilterKind;
  name: string;
  reason: "unknown" | "ambiguous";
  /** Populated for `ambiguous`; every entity sharing the folded name. */
  candidates: readonly SearchFilterCandidate[];
};

export type SearchFilterResolution = {
  resolved: readonly ResolvedSearchFilter[];
  problems: readonly SearchFilterProblem[];
};

type NameIndex = ReadonlyMap<string, readonly SearchFilterCandidate[]>;

/**
 * Keyed on the identity of `state.tags` / `state.people`. Every rename, merge,
 * create and delete rebuilds those maps, so a stale index is unreachable.
 */
const indexCache = new WeakMap<object, NameIndex>();

function nameIndex(source: ReadonlyMap<string, { name: string }>): NameIndex {
  const cached = indexCache.get(source);
  if (cached) {
    return cached;
  }
  const index = new Map<string, SearchFilterCandidate[]>();
  for (const [id, record] of source) {
    const key = normalizeEntityName(record.name);
    if (key.length === 0) {
      continue;
    }
    const bucket = index.get(key) ?? [];
    bucket.push({ id, label: record.name });
    index.set(key, bucket);
  }
  for (const bucket of index.values()) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
  }
  indexCache.set(source, index);
  return index;
}

/**
 * One-line explanation of why a filter could not be applied. Shared by every
 * search surface so an unknown or ambiguous name reads the same everywhere.
 */
export function describeSearchFilterProblem(problem: SearchFilterProblem): string {
  const noun = problem.kind === "tag" ? "tag" : "person";
  if (problem.reason === "unknown") {
    return `No ${noun} named “${problem.name}”.`;
  }
  const labels = problem.candidates.map((candidate) => candidate.label).join(", ");
  return `“${problem.name}” matches ${problem.candidates.length} ${noun}s (${labels}). Rename one to search by name.`;
}

/**
 * Maps parsed filter names onto hydrated entity ids. A name matched by more
 * than one entity is reported as ambiguous with every candidate attached; the
 * resolver never picks one, because either choice would silently change what
 * the query means.
 */
export function resolveSearchFilters(
  state: RendererState,
  filters: readonly SearchFilter[],
): SearchFilterResolution {
  const resolved: ResolvedSearchFilter[] = [];
  const problems: SearchFilterProblem[] = [];
  for (const filter of filters) {
    const index = nameIndex(filter.kind === "tag" ? state.tags : state.people);
    const candidates = index.get(filter.key) ?? [];
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only) {
      resolved.push({
        kind: filter.kind,
        name: filter.name,
        targetId: only.id,
        label: only.label,
      });
    } else if (candidates.length === 0) {
      problems.push({ kind: filter.kind, name: filter.name, reason: "unknown", candidates: [] });
    } else {
      problems.push({ kind: filter.kind, name: filter.name, reason: "ambiguous", candidates });
    }
  }
  return { resolved, problems };
}
