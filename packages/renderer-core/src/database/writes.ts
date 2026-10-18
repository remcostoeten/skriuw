import type {
  NoteProperty,
  NotePropertyColor,
  NotePropertyOption,
  NotePropertyValue,
  WorkspaceOperation,
} from "../contracts/workspace";
import { createNoteProperty, upsertNoteProperty } from "../properties/operations";
import { NOTE_PROPERTY_COLORS, type PropertyIdFactory } from "../properties/types";
import {
  isPropertyValidationError,
  MAX_NOTE_PROPERTIES,
  MAX_PROPERTY_OPTIONS,
} from "../properties/value";
import type { RendererState } from "../store/types";
import {
  foldOptionLabel,
  propertyColumnKey,
  type DatabaseColumn,
  type PropertyColumn,
} from "./columns";
import type { DatabaseView } from "./config";
import { databaseScopeStatus } from "./rows";

export type CellInput =
  | { kind: "value"; value: NotePropertyValue }
  | { kind: "labels"; labels: readonly string[] };

export type DatabaseWrite =
  | { status: "ready"; operations: WorkspaceOperation[] }
  | { status: "refused"; message: string };

export type CellPreset = { column: PropertyColumn; input: CellInput };

export type NoteDocument = { documentJson: unknown; markdown: string };

type BuiltProperty = { status: "ready"; property: NoteProperty | null } | Refusal;
type Refusal = { status: "refused"; message: string };

/**
 * The operations that set one cell. The write is built from current store
 * state, creates the property when the note lacks it, adds a select option
 * when the note's own options lack the label, and is validated here because
 * the store drops an invalid property write without saying so.
 */
export function planCellWrite(
  state: RendererState,
  noteId: string,
  column: PropertyColumn,
  input: CellInput,
  at: number,
  createId: PropertyIdFactory,
): DatabaseWrite {
  if (state.nodes.get(noteId)?.kind !== "note") {
    return refused("This note is in the trash or no longer exists.");
  }
  const properties = state.propertiesByNoteId.get(noteId) ?? [];
  const built = buildProperty(noteId, properties, column, input, createId);
  if (built.status === "refused") return built;
  if (built.property === null) return { status: "ready", operations: [] };
  const checked = validate(properties, built.property, state);
  if (checked !== null) return checked;
  return {
    status: "ready",
    operations: [{ type: "set_note_property", property: built.property, at }],
  };
}

/**
 * Creates a titled note in the scope folder with the preset cells already
 * set, keeping the note that was open active because the view stays in front.
 */
export function planDatabaseNote(
  state: RendererState,
  folderId: string | null,
  title: string,
  document: NoteDocument,
  presets: readonly CellPreset[],
  at: number,
  noteId: string,
  createId: PropertyIdFactory,
): DatabaseWrite {
  if (databaseScopeStatus(state, folderId) !== "ready") {
    return refused("This folder is in the trash or no longer exists.");
  }
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id: noteId,
      title,
      placement: { parentId: folderId, position: { type: "last" } },
      documentJson: document.documentJson,
      markdown: document.markdown,
      at,
    },
  ];
  let properties: NoteProperty[] = [];
  for (const preset of presets) {
    const built = buildProperty(noteId, properties, preset.column, preset.input, createId);
    if (built.status === "refused") return built;
    if (built.property === null) continue;
    const checked = validate(properties, built.property, state);
    if (checked !== null) return checked;
    properties = upsertNoteProperty(properties, built.property, personContext(state));
    operations.push({ type: "set_note_property", property: built.property, at });
  }
  operations.push({ type: "set_active_note", noteId: state.activeNoteId });
  return { status: "ready", operations };
}

/**
 * Cells a new note should start with so it lands where it was created: in
 * the board group it was added to and inside the view's equality filters.
 */
export function impliedPresets(
  columns: readonly DatabaseColumn[],
  view: DatabaseView,
  groupKey: string | null | undefined,
): CellPreset[] {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const presets = new Map<string, CellPreset>();
  for (const filter of view.filters) {
    const column = byKey.get(filter.column);
    if (column?.kind !== "property") continue;
    const input = filterInput(column, filter.operator, filter.value);
    if (input !== null) presets.set(column.key, { column, input });
  }
  const groupColumn = view.groupBy === null ? undefined : byKey.get(view.groupBy);
  if (groupKey !== undefined && groupColumn?.kind === "property") {
    const input = groupInput(groupColumn, groupKey);
    if (input !== null) presets.set(groupColumn.key, { column: groupColumn, input });
  }
  return [...presets.values()];
}

/** The cell input that moves a card into a board group. */
export function groupInput(column: PropertyColumn, groupKey: string | null): CellInput | null {
  if (column.type === "checkbox") {
    return {
      kind: "value",
      value: { valueVersion: 1, type: "checkbox", value: groupKey === "checked" },
    };
  }
  if (column.type !== "select") return null;
  if (groupKey === null) return { kind: "labels", labels: [] };
  const option = column.options.find((entry) => entry.key === groupKey);
  return option ? { kind: "labels", labels: [option.label] } : null;
}

function filterInput(column: PropertyColumn, operator: string, value: string): CellInput | null {
  if (column.type === "checkbox") {
    if (operator !== "checked") return null;
    return { kind: "value", value: { valueVersion: 1, type: "checkbox", value: true } };
  }
  if (column.type !== "select" && column.type !== "multi-select") return null;
  if (operator !== "is" && operator !== "contains") return null;
  const option = column.options.find((entry) => entry.key === foldOptionLabel(value));
  return option ? { kind: "labels", labels: [option.label] } : null;
}

function buildProperty(
  noteId: string,
  properties: readonly NoteProperty[],
  column: PropertyColumn,
  input: CellInput,
  createId: PropertyIdFactory,
): BuiltProperty {
  const existing = properties.find((property) => propertyColumnKey(property.name) === column.key);
  if (existing !== undefined && existing.value.type !== column.type) {
    return refused(`${column.name} has a different type in this note. Open the note to change it.`);
  }
  let base = existing;
  if (base === undefined) {
    if (properties.length >= MAX_NOTE_PROPERTIES) {
      return refused(`This note already has ${MAX_NOTE_PROPERTIES} properties.`);
    }
    base = createNoteProperty(noteId, column.type, createId, column.name, properties.length);
    if (column.type === "select" || column.type === "multi-select") {
      base = {
        ...base,
        options: column.options.slice(0, MAX_PROPERTY_OPTIONS).map((option) => ({
          id: createId("option"),
          label: option.label,
          color: option.color,
        })),
      };
    }
  }
  const next = applyInput(base, column, input, createId);
  if (next.status === "refused") return next;
  if (existing !== undefined && sameProperty(existing, next.property!)) {
    return { status: "ready", property: null };
  }
  return next;
}

function applyInput(
  property: NoteProperty,
  column: PropertyColumn,
  input: CellInput,
  createId: PropertyIdFactory,
): BuiltProperty {
  if (input.kind === "value") {
    if (input.value.type !== column.type)
      return refused(`${column.name} expects a different value.`);
    return { status: "ready", property: { ...property, value: input.value } };
  }
  if (column.type !== "select" && column.type !== "multi-select") {
    return refused(`${column.name} does not have options.`);
  }
  const options = [...property.options];
  const ids: string[] = [];
  for (const label of input.labels) {
    const trimmed = label.trim();
    if (trimmed.length === 0) continue;
    let option =
      options.find((entry) => entry.label === trimmed) ??
      options.find((entry) => foldOptionLabel(entry.label) === foldOptionLabel(trimmed));
    if (option === undefined) {
      if (options.length >= MAX_PROPERTY_OPTIONS) {
        return refused(`${column.name} already has ${MAX_PROPERTY_OPTIONS} options in this note.`);
      }
      option = {
        id: createId("option"),
        label: trimmed,
        color: optionColor(column, options, trimmed),
      };
      options.push(option);
    }
    if (!ids.includes(option.id)) ids.push(option.id);
  }
  const value: NotePropertyValue =
    column.type === "select"
      ? { valueVersion: 1, type: "select", value: ids[0] ?? null }
      : { valueVersion: 1, type: "multi-select", value: ids };
  return { status: "ready", property: { ...property, options, value } };
}

function optionColor(
  column: PropertyColumn,
  options: readonly NotePropertyOption[],
  label: string,
): NotePropertyColor {
  const known = column.options.find((option) => option.key === foldOptionLabel(label));
  if (known) return known.color;
  const used = new Set([
    ...column.options.map((option) => option.color),
    ...options.map((option) => option.color),
  ]);
  return NOTE_PROPERTY_COLORS.find((color) => !used.has(color)) ?? "gray";
}

function validate(
  properties: readonly NoteProperty[],
  property: NoteProperty,
  state: RendererState,
): Refusal | null {
  try {
    upsertNoteProperty(properties, property, personContext(state));
    return null;
  } catch (error) {
    if (isPropertyValidationError(error)) return refused(error.message);
    throw error;
  }
}

function personContext(state: RendererState) {
  return { personIds: new Set(state.people.keys()) };
}

function sameProperty(left: NoteProperty, right: NoteProperty): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function refused(message: string): Refusal {
  return { status: "refused", message };
}
