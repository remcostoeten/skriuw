import type { RendererState } from "@/store/types";
import { projectReferencingNotes } from "./reference-panel-model";
import type { PersonRecord, ReferenceOperation, TagRecord } from "./types";

export type EntityKind = "tag" | "person";

export type EntityRow = {
  kind: EntityKind;
  id: string;
  name: string;
  color: string | null;
  initials: string | null;
  note: string | null;
  noteCount: number;
  createdAt: number;
  updatedAt: number;
  createdInTitle: string | null;
};

export type EntityColorOption = {
  name: string;
  value: string;
};

/** Mid-tone, lightly desaturated hues that stay legible on both light and dark themes. */
export const ENTITY_COLOR_OPTIONS: readonly EntityColorOption[] = [
  { name: "Red", value: "#d2555a" },
  { name: "Orange", value: "#d3803f" },
  { name: "Amber", value: "#c9a13c" },
  { name: "Green", value: "#4d9d6e" },
  { name: "Teal", value: "#3f9d99" },
  { name: "Blue", value: "#5589cf" },
  { name: "Violet", value: "#8a79ce" },
  { name: "Pink", value: "#c66c98" },
];

export const ENTITY_COLORS: readonly string[] = ENTITY_COLOR_OPTIONS.map(
  (option) => option.value,
);

export function entityNoun(kind: EntityKind): string {
  return kind === "tag" ? "tag" : "person";
}

export function entityNounPlural(kind: EntityKind): string {
  return kind === "tag" ? "tags" : "people";
}

function resolveCreatedInTitle(state: RendererState, createdIn: string | null): string | null {
  if (createdIn === null) {
    return null;
  }
  return state.metadata.get(createdIn)?.title ?? null;
}

function tagToRow(state: RendererState, tag: TagRecord): EntityRow {
  return {
    kind: "tag",
    id: tag.id,
    name: tag.name,
    color: tag.color,
    initials: null,
    note: null,
    noteCount: projectReferencingNotes(state, "tag", tag.id).length,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
    createdInTitle: resolveCreatedInTitle(state, tag.createdIn),
  };
}

function personToRow(state: RendererState, person: PersonRecord): EntityRow {
  return {
    kind: "person",
    id: person.id,
    name: person.name,
    color: person.color,
    initials: person.initials,
    note: person.note,
    noteCount: projectReferencingNotes(state, "person", person.id).length,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
    createdInTitle: resolveCreatedInTitle(state, person.createdIn),
  };
}

export function projectEntities(state: RendererState, kind: EntityKind): EntityRow[] {
  const rows =
    kind === "tag"
      ? [...state.tags.values()].map((tag) => tagToRow(state, tag))
      : [...state.people.values()].map((person) => personToRow(state, person));
  rows.sort((left, right) => left.name.localeCompare(right.name));
  return rows;
}

export function entityRowsEqual(
  left: readonly EntityRow[],
  right: readonly EntityRow[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((row, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      row.id === other.id &&
      row.name === other.name &&
      row.color === other.color &&
      row.initials === other.initials &&
      row.note === other.note &&
      row.noteCount === other.noteCount &&
      row.createdAt === other.createdAt &&
      row.updatedAt === other.updatedAt &&
      row.createdInTitle === other.createdInTitle
    );
  });
}

export function deriveInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "";
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

function normalize(value: string): string {
  return value.trim();
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildCreateTag(
  id: string,
  name: string,
  color: string | null,
): ReferenceOperation | null {
  const trimmed = normalize(name);
  if (trimmed.length === 0) {
    return null;
  }
  const now = Date.now();
  return {
    type: "create_tag",
    tag: { id, name: trimmed, color, createdAt: now, updatedAt: now, createdIn: "tags" },
  };
}

export function buildCreatePerson(
  id: string,
  name: string,
  initials: string,
  color: string | null,
  note: string,
): ReferenceOperation | null {
  const trimmed = normalize(name);
  if (trimmed.length === 0) {
    return null;
  }
  const resolvedInitials = normalizeOptional(initials) ?? deriveInitials(trimmed);
  const now = Date.now();
  return {
    type: "create_person",
    person: {
      id,
      name: trimmed,
      initials: resolvedInitials.length > 0 ? resolvedInitials : null,
      color,
      note: normalizeOptional(note),
      createdAt: now,
      updatedAt: now,
      createdIn: "people",
    },
  };
}

export function buildRename(
  kind: EntityKind,
  id: string,
  name: string,
): ReferenceOperation | null {
  const trimmed = normalize(name);
  if (trimmed.length === 0) {
    return null;
  }
  return kind === "tag"
    ? { type: "rename_tag", id, name: trimmed }
    : { type: "rename_person", id, name: trimmed };
}

export function buildRecolor(
  kind: EntityKind,
  id: string,
  color: string | null,
): ReferenceOperation {
  return kind === "tag"
    ? { type: "recolor_tag", id, color }
    : { type: "recolor_person", id, color };
}

export function buildDelete(kind: EntityKind, id: string): ReferenceOperation {
  return kind === "tag" ? { type: "delete_tag", id } : { type: "delete_person", id };
}
