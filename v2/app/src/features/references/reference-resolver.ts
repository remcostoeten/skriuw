import type { RendererState } from "@/store/types";
import type { ReferenceKind } from "./types";

export type ResolvedReference = {
  label: string;
  availability: "resolved" | "unavailable" | "unresolved";
};

export function resolveReference(
  state: RendererState,
  kind: ReferenceKind,
  targetId: string,
  fallbackLabel: string,
): ResolvedReference {
  if (kind === "tag") {
    const tag = state.tags.get(targetId);
    return tag
      ? { label: tag.name, availability: "resolved" }
      : { label: fallbackLabel, availability: "unresolved" };
  }
  if (kind === "person") {
    const person = state.people.get(targetId);
    return person
      ? { label: person.name, availability: "resolved" }
      : { label: fallbackLabel, availability: "unresolved" };
  }
  if (state.nodes.has(targetId)) {
    const title = state.nodes.get(targetId)?.title ?? fallbackLabel;
    return { label: title, availability: "resolved" };
  }
  const trashed = state.sourceNodes.get(targetId);
  if (trashed) {
    return { label: trashed.title, availability: "unavailable" };
  }
  return { label: fallbackLabel, availability: "unresolved" };
}

export function referenceText(
  kind: ReferenceKind,
  resolved: ResolvedReference,
): string {
  const prefix = kind === "tag" ? "#" : kind === "person" ? "$" : "@";
  return `${prefix}${resolved.label}`;
}

export function referenceAriaLabel(
  kind: ReferenceKind,
  resolved: ResolvedReference,
): string {
  const noun = kind === "tag" ? "Tag" : kind === "person" ? "Person" : "Note";
  if (resolved.availability === "unavailable") {
    return `${noun} ${resolved.label}, unavailable`;
  }
  if (resolved.availability === "unresolved") {
    return `${noun} ${resolved.label}, no longer exists`;
  }
  return `${noun} ${resolved.label}`;
}
