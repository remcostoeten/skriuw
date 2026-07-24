import type { RendererState } from "../store/types";
import { referenceKey, type ReferenceKind, type ReferenceOperation } from "./types";

export const referenceColorSwatches: readonly string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function buildRenameReferenceOperation(
  entry: ReferenceDetailEntry,
  name: string,
): ReferenceOperation | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed === entry.name) {
    return null;
  }
  return entry.kind === "tag"
    ? { type: "rename_tag", id: entry.id, name: trimmed }
    : { type: "rename_person", id: entry.id, name: trimmed };
}

export function buildRecolorReferenceOperation(
  entry: ReferenceDetailEntry,
  color: string | null,
): ReferenceOperation | null {
  if (color === entry.color) {
    return null;
  }
  return entry.kind === "tag"
    ? { type: "recolor_tag", id: entry.id, color }
    : { type: "recolor_person", id: entry.id, color };
}

export function buildDeleteReferenceOperation(entry: ReferenceDetailEntry): ReferenceOperation {
  return entry.kind === "tag"
    ? { type: "delete_tag", id: entry.id }
    : { type: "delete_person", id: entry.id };
}

export type BacklinkEntry = {
  noteId: string;
  title: string;
};

export type ReferenceDetailEntry = {
  kind: ReferenceKind;
  id: string;
  name: string;
  color: string | null;
  noteCount: number;
};

export function projectReferencingNotes(
  state: RendererState,
  kind: ReferenceKind,
  targetId: string,
): BacklinkEntry[] {
  const sources = state.incomingReferences.get(referenceKey(kind, targetId)) ?? [];
  const entries: BacklinkEntry[] = [];
  for (const noteId of sources) {
    const metadata = state.metadata.get(noteId);
    if (metadata) {
      entries.push({ noteId, title: metadata.title });
    }
  }
  entries.sort((left, right) => left.title.localeCompare(right.title));
  return entries;
}

export function projectBacklinks(state: RendererState, noteId: string): BacklinkEntry[] {
  return projectReferencingNotes(state, "note", noteId).filter(
    (entry) => entry.noteId !== noteId,
  );
}

export function projectNoteReferenceDetails(
  state: RendererState,
  noteId: string,
): ReferenceDetailEntry[] {
  const targets = state.outgoingReferences.get(noteId) ?? [];
  const entries: ReferenceDetailEntry[] = [];
  for (const target of targets) {
    if (target.kind === "tag") {
      const tag = state.tags.get(target.targetId);
      if (tag) {
        entries.push({
          kind: "tag",
          id: tag.id,
          name: tag.name,
          color: tag.color,
          noteCount: projectReferencingNotes(state, "tag", tag.id).length,
        });
      }
    }
    if (target.kind === "person") {
      const person = state.people.get(target.targetId);
      if (person) {
        entries.push({
          kind: "person",
          id: person.id,
          name: person.name,
          color: person.color,
          noteCount: projectReferencingNotes(state, "person", person.id).length,
        });
      }
    }
  }
  return entries;
}

export function backlinksEqual(
  left: readonly BacklinkEntry[],
  right: readonly BacklinkEntry[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (entry, index) =>
      entry.noteId === right[index]?.noteId && entry.title === right[index]?.title,
  );
}

export function referenceDetailsEqual(
  left: readonly ReferenceDetailEntry[],
  right: readonly ReferenceDetailEntry[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.kind === other.kind &&
      entry.id === other.id &&
      entry.name === other.name &&
      entry.color === other.color &&
      entry.noteCount === other.noteCount
    );
  });
}
