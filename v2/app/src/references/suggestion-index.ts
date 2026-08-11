import type { RendererState } from "@/store/types";
import type { ReferenceKind } from "./types";

export type Suggestion = {
  kind: ReferenceKind;
  id: string;
  label: string;
};

export type MentionSuggestions = {
  people: readonly Suggestion[];
  notes: readonly Suggestion[];
};

export const SUGGESTION_LIMIT = 8;

type IndexEntry = {
  id: string;
  label: string;
  normalized: string;
};

const entryCache = new WeakMap<object, IndexEntry[]>();

function indexEntries(
  source: ReadonlyMap<string, unknown>,
  toLabel: (value: unknown) => string,
): IndexEntry[] {
  const cached = entryCache.get(source);
  if (cached) {
    return cached;
  }
  const entries: IndexEntry[] = [];
  for (const [id, value] of source) {
    const label = toLabel(value);
    entries.push({ id, label, normalized: label.toLowerCase() });
  }
  entries.sort((left, right) => left.normalized.localeCompare(right.normalized));
  entryCache.set(source, entries);
  return entries;
}

function rank(normalized: string, needle: string): number {
  if (needle.length === 0) {
    return 1;
  }
  if (normalized === needle) {
    return 0;
  }
  if (normalized.startsWith(needle)) {
    return 1;
  }
  if (normalized.includes(needle)) {
    return 2;
  }
  return -1;
}

function query(
  entries: readonly IndexEntry[],
  kind: ReferenceKind,
  needle: string,
  limit: number,
): Suggestion[] {
  const buckets: Suggestion[][] = [[], [], []];
  for (const entry of entries) {
    const score = rank(entry.normalized, needle);
    if (score < 0) {
      continue;
    }
    const bucket = buckets[score];
    if (bucket) {
      bucket.push({ kind, id: entry.id, label: entry.label });
    }
    if (score === 1 && (buckets[0]?.length ?? 0) + (buckets[1]?.length ?? 0) >= limit) {
      break;
    }
  }
  return buckets.flat().slice(0, limit);
}

function tagLabel(value: unknown): string {
  return (value as { name: string }).name;
}

function personLabel(value: unknown): string {
  return (value as { name: string }).name;
}

function noteLabel(value: unknown): string {
  return (value as { title: string }).title;
}

export function queryTagSuggestions(
  state: RendererState,
  needle: string,
  limit = SUGGESTION_LIMIT,
): Suggestion[] {
  return query(indexEntries(state.tags, tagLabel), "tag", needle.toLowerCase(), limit);
}

export function queryMentionSuggestions(
  state: RendererState,
  needle: string,
  limit = SUGGESTION_LIMIT,
): MentionSuggestions {
  const normalized = needle.toLowerCase();
  return {
    people: query(indexEntries(state.people, personLabel), "person", normalized, limit),
    notes: query(indexEntries(state.metadata, noteLabel), "note", normalized, limit).filter(
      (suggestion) => suggestion.id !== state.activeNoteId,
    ),
  };
}
