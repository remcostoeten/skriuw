import type { RendererState } from "@skriuw/renderer-core/store/types";
import {
  queryMentionSuggestions,
  queryTagSuggestions,
  type Suggestion,
} from "../suggestions/query";

export type MentionTrigger = "#" | "$" | "@";

export type MentionMenuItem =
  | { type: "suggestion"; group: "tags" | "people" | "notes"; suggestion: Suggestion }
  | { type: "create"; kind: "tag" | "person" | "note"; name: string };

export function mentionMenuItems(
  rendererState: RendererState,
  trigger: MentionTrigger,
  query: string,
): MentionMenuItem[] {
  const items: MentionMenuItem[] = [];
  const normalized = query.toLowerCase();
  if (trigger === "#") {
    const suggestions = queryTagSuggestions(rendererState, query);
    for (const suggestion of suggestions) {
      items.push({ type: "suggestion", group: "tags", suggestion });
    }
    const exact = suggestions.some((suggestion) => suggestion.label.toLowerCase() === normalized);
    if (query.length > 0 && !exact) {
      items.push({ type: "create", kind: "tag", name: query });
    }
    return items;
  }
  if (trigger === "$") {
    const grouped = queryMentionSuggestions(rendererState, query);
    for (const suggestion of grouped.people) {
      items.push({ type: "suggestion", group: "people", suggestion });
    }
    const exactPerson = grouped.people.some(
      (suggestion) => suggestion.label.toLowerCase() === normalized,
    );
    if (query.length > 0 && !exactPerson) {
      items.push({ type: "create", kind: "person", name: query });
    }
    return items;
  }
  const noteName = query.trim();
  const grouped = queryMentionSuggestions(rendererState, noteName);
  for (const suggestion of grouped.notes) {
    items.push({ type: "suggestion", group: "notes", suggestion });
  }
  const exactNote = grouped.notes.some(
    (suggestion) => suggestion.label.toLowerCase() === noteName.toLowerCase(),
  );
  if (noteName.length > 0 && !exactNote) {
    items.push({ type: "create", kind: "note", name: noteName });
  }
  return items;
}

export function normalizedMentionIndex(index: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  return ((index % count) + count) % count;
}
