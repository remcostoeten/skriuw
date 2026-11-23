import type { NoteProperty, NotePropertyValue } from "@skriuw/renderer-core/contracts/workspace";
import {
  foldOptionLabel,
  propertyColumnKey,
  type DatabaseColumn,
  type PropertyColumn,
} from "@skriuw/renderer-core/database/columns";
import type { CellInput } from "@skriuw/renderer-core/database/writes";
import {
  NOTE_PROPERTY_COLORS,
  NOTE_PROPERTY_TYPES,
  type NotePropertyType,
  type PropertyIdFactory,
} from "@skriuw/renderer-core/properties/types";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { normalizeEntityName } from "@skriuw/renderer-core/search/query-parser";
import { refuse } from "./protocol/input";
import { isJsonObject, type JsonValue } from "./protocol/json";

export const PROPERTY_TYPES = NOTE_PROPERTY_TYPES;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const PROPERTY_VALUE_SCHEMA = {
  description:
    'A property value. Plain values: text, number, true/false, "YYYY-MM-DD" for dates, an option label for select, a list of labels for multi-select, a list of people names for person. Use {"type": "...", "value": ...} to choose the type of a new property. null removes the property.',
} as const;

/**
 * @name propertyIdFactory
 * @description Property and option ids in the form the property editor
 * creates, drawn from the tool context's id source.
 *
 * @example
 * const createId = propertyIdFactory(() => crypto.randomUUID());
 */
export function propertyIdFactory(createId: () => string): PropertyIdFactory {
  return (kind) => `${kind}_${createId()}`;
}

/**
 * @name declaredColumn
 * @description A database column described by an agent: a name, a type and,
 * for select types, its options in lane order.
 *
 * @example
 * declaredColumn("Status", "select", ["Backlog", "Doing", "Done"]);
 */
export function declaredColumn(
  name: string,
  type: NotePropertyType,
  labels: readonly string[] = [],
): PropertyColumn {
  const options =
    type === "select" || type === "multi-select"
      ? [...new Map(labels.map((label) => [foldOptionLabel(label), label.trim()])).entries()]
          .filter(([key]) => key.length > 0)
          .map(([key, label], index) => ({
            key,
            label,
            color: NOTE_PROPERTY_COLORS[index % NOTE_PROPERTY_COLORS.length]!,
          }))
      : [];
  return { key: propertyColumnKey(name), name: name.trim(), kind: "property", type, options };
}

/**
 * @name resolveColumn
 * @description The column a value for `name` is written against: the note's
 * own property first, then the surrounding database's column, then a type the
 * agent names, then a type inferred from the value itself.
 *
 * @example
 * resolveColumn("Status", "Doing", { note: properties, database: columns });
 */
export function resolveColumn(
  name: string,
  value: JsonValue,
  known: { note: readonly NoteProperty[]; database: readonly DatabaseColumn[] },
): PropertyColumn {
  const key = propertyColumnKey(name);
  const owned = known.note.find((property) => propertyColumnKey(property.name) === key);
  const shared = known.database.find(
    (column): column is PropertyColumn => column.kind === "property" && column.key === key,
  );
  const explicit = explicitType(value);
  if (owned !== undefined) {
    return {
      key,
      name: owned.name,
      kind: "property",
      type: owned.value.type,
      options:
        shared?.options ??
        owned.options.map((option) => ({
          key: foldOptionLabel(option.label),
          label: option.label,
          color: option.color,
        })),
    };
  }
  if (shared !== undefined && (explicit === null || explicit === shared.type)) return shared;
  return declaredColumn(name, explicit ?? inferredType(value));
}

/**
 * @name cellInput
 * @description Converts an agent's JSON value into the cell write the
 * database view would make for the same column.
 *
 * @example
 * cellInput(statusColumn, "Doing", state); // { kind: "labels", labels: ["Doing"] }
 */
export function cellInput(column: PropertyColumn, raw: JsonValue, state: RendererState): CellInput {
  const value = isJsonObject(raw) && "value" in raw ? (raw.value ?? null) : raw;
  const name = column.name;
  switch (column.type) {
    case "select":
      if (value === null) return { kind: "labels", labels: [] };
      if (typeof value !== "string") refuse(`${name} takes one option label.`);
      return { kind: "labels", labels: [value] };
    case "multi-select":
      return { kind: "labels", labels: stringList(name, value) };
    case "person":
      return versioned({
        valueVersion: 1,
        type: "person",
        value: personIds(name, stringList(name, value), state),
      });
    case "checkbox":
      if (typeof value !== "boolean") refuse(`${name} takes true or false.`);
      return versioned({ valueVersion: 1, type: "checkbox", value });
    case "number":
      return versioned({ valueVersion: 1, type: "number", value: numberValue(name, value) });
    case "rating": {
      const rating = numberValue(name, value);
      if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 5)) {
        refuse(`${name} takes a whole rating from 0 to 5.`);
      }
      return versioned({ valueVersion: 1, type: "rating", value: rating });
    }
    case "date": {
      const date = value === null ? "" : value;
      if (typeof date !== "string" || (date !== "" && !DATE_KEY.test(date))) {
        refuse(`${name} takes a date as YYYY-MM-DD.`);
      }
      return versioned({ valueVersion: 1, type: "date", value: date });
    }
    case "text":
    case "url":
    case "location":
    case "email":
    case "phone": {
      const text = value === null ? "" : value;
      if (typeof text !== "string") refuse(`${name} takes text.`);
      return versioned({ valueVersion: 1, type: column.type, value: text });
    }
  }
}

/**
 * @name readablePropertyValue
 * @description A stored property as the agent reads it: option labels instead
 * of option ids and people's names instead of person ids.
 *
 * @example
 * readablePropertyValue(property, state); // "Doing"
 */
export function readablePropertyValue(property: NoteProperty, state: RendererState): JsonValue {
  const { value } = property.value;
  switch (property.value.type) {
    case "select":
      return property.options.find((option) => option.id === value)?.label ?? null;
    case "multi-select":
      return property.value.value.flatMap((id) => {
        const label = property.options.find((option) => option.id === id)?.label;
        return label === undefined ? [] : [label];
      });
    case "person":
      return property.value.value.map((id) => state.people.get(id)?.name ?? id);
    default:
      return value;
  }
}

/**
 * @name readableProperties
 * @description A note's properties keyed by name, in their stored order.
 *
 * @example
 * readableProperties(state, "note-1"); // { Status: "Doing", Points: 3 }
 */
export function readableProperties(
  state: RendererState,
  noteId: string,
): Record<string, JsonValue> {
  const properties = state.propertiesByNoteId.get(noteId) ?? [];
  return Object.fromEntries(
    properties.map((property) => [property.name, readablePropertyValue(property, state)]),
  );
}

function versioned(value: NotePropertyValue): CellInput {
  return { kind: "value", value };
}

function explicitType(value: JsonValue): NotePropertyType | null {
  if (!isJsonObject(value) || typeof value.type !== "string") return null;
  const type = PROPERTY_TYPES.find((candidate) => candidate === value.type);
  if (type === undefined) refuse(`Unknown property type ${value.type}.`);
  return type;
}

function inferredType(value: JsonValue): NotePropertyType {
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "multi-select";
  if (typeof value === "string" && DATE_KEY.test(value)) return "date";
  return "text";
}

function stringList(name: string, value: JsonValue): string[] {
  if (value === null) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    refuse(`${name} takes a list of labels.`);
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function numberValue(name: string, value: JsonValue): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) refuse(`${name} takes a number.`);
  return value;
}

function personIds(name: string, names: readonly string[], state: RendererState): string[] {
  const byName = new Map(
    [...state.people.values()].map((person) => [normalizeEntityName(person.name), person.id]),
  );
  return names.map((personName) => {
    const id = byName.get(normalizeEntityName(personName)) ?? state.people.get(personName)?.id;
    if (id === undefined) refuse(`${name}: nobody called "${personName}" is in this workspace.`);
    return id;
  });
}
