import { referenceKey, type ReferenceKind } from "@skriuw/renderer-core/references/types";
import type { RendererState } from "@skriuw/renderer-core/store/types";

export type ReferenceNote = {
  id: string;
  title: string;
};

export type ReferenceEntry = {
  id: string;
  name: string;
  count: number;
  notes: readonly ReferenceNote[];
};

export function selectReferenceEntries(
  kind: Extract<ReferenceKind, "tag" | "person">,
): (state: RendererState) => ReferenceEntry[] {
  return (state) => {
    const records = kind === "tag" ? state.tags : state.people;
    const entries: ReferenceEntry[] = [];
    for (const record of records.values()) {
      const notes = (state.incomingReferences.get(referenceKey(kind, record.id)) ?? [])
        .map((noteId) => {
          const note = state.nodes.get(noteId);
          return note ? { id: note.id, title: note.title } : null;
        })
        .filter((note): note is ReferenceNote => note !== null)
        .sort((left, right) => left.title.localeCompare(right.title));
      entries.push({ id: record.id, name: record.name, count: notes.length, notes });
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name));
  };
}

export function referenceEntriesEqual(
  left: readonly ReferenceEntry[],
  right: readonly ReferenceEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        entry.id === other.id &&
        entry.name === other.name &&
        entry.count === other.count &&
        entry.notes.length === other.notes.length &&
        entry.notes.every(
          (note, noteIndex) =>
            note.id === other.notes[noteIndex]?.id && note.title === other.notes[noteIndex]?.title,
        )
      );
    })
  );
}
