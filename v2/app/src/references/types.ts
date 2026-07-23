export type TagRecord = {
  id: string;
  name: string;
  color: string | null;
};

export type PersonRecord = {
  id: string;
  name: string;
  initials: string | null;
  color: string | null;
  note: string | null;
};

export type ReferenceKind = "tag" | "person" | "note";

export type StructuredReference = {
  kind: ReferenceKind;
  targetId: string;
};

export type NoteReferences = {
  noteId: string;
  targets: readonly StructuredReference[];
};

export type ReferenceBootstrap = {
  tags: readonly TagRecord[];
  people: readonly PersonRecord[];
  references: readonly NoteReferences[];
};

export type ReferenceOperation =
  | { type: "create_tag"; tag: TagRecord }
  | { type: "rename_tag"; id: string; name: string }
  | { type: "delete_tag"; id: string }
  | { type: "create_person"; person: PersonRecord }
  | { type: "rename_person"; id: string; name: string }
  | { type: "delete_person"; id: string };

export function emptyReferenceBootstrap(): ReferenceBootstrap {
  return { tags: [], people: [], references: [] };
}

export function referenceKey(kind: ReferenceKind, targetId: string): string {
  return `${kind}:${targetId}`;
}
