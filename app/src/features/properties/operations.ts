import {
  type NoteProperty,
  type NotePropertyColor,
  type NotePropertyOption,
  type NotePropertyType,
  type NotePropertyValue,
  type PropertyIdFactory,
} from "./types";
import {
  emptyNotePropertyValue,
  normalizeNotePropertyField,
  normalizeNotePropertyFields,
  type PropertyValidationContext,
  propertyValidationError,
} from "./value";

export function createNoteProperty(
  noteId: string,
  type: NotePropertyType,
  idFactory: PropertyIdFactory,
  name: string = defaultPropertyName(type),
  position = 0,
): NoteProperty {
  assertNoteId(noteId);
  const field = normalizeNotePropertyField({
    id: idFactory("property"),
    name,
    value: emptyNotePropertyValue(type),
    options: [],
    position,
  });
  return { noteId, ...field };
}

export function changeNotePropertyType(
  property: NoteProperty,
  type: NotePropertyType,
): NoteProperty {
  return {
    ...property,
    value: emptyNotePropertyValue(type),
    options: [],
  };
}

export function upsertNoteProperty(
  properties: readonly NoteProperty[],
  property: NoteProperty,
  context: PropertyValidationContext = {},
): NoteProperty[] {
  const noteId = assertSingleOwner(properties, property.noteId);
  const field = normalizeNotePropertyField(property, context);
  const index = properties.findIndex((entry) => entry.id === property.id);
  if (index < 0) {
    if (field.position !== properties.length) {
      throw propertyValidationError(["new property position must append to the ordered set"]);
    }
    return [...properties.map(cloneProperty), { noteId, ...field }];
  }
  if (field.position !== properties[index]?.position) {
    throw propertyValidationError(["setting a property cannot reorder it"]);
  }
  return properties.map((entry, entryIndex) =>
    entryIndex === index ? { noteId, ...field } : cloneProperty(entry),
  );
}

export function removeNoteProperty(
  properties: readonly NoteProperty[],
  propertyId: string,
): NoteProperty[] {
  if (!properties.some((property) => property.id === propertyId)) {
    throw propertyValidationError([`unknown property ${propertyId}`]);
  }
  return properties
    .filter((property) => property.id !== propertyId)
    .map((property, position) => ({ ...cloneProperty(property), position }));
}

export function reorderNoteProperties(
  properties: readonly NoteProperty[],
  orderedIds: readonly string[],
): NoteProperty[] {
  assertCompleteOrder(
    properties.map((property) => property.id),
    orderedIds,
    "property",
  );
  const byId = new Map(properties.map((property) => [property.id, property]));
  return orderedIds.map((id, position) => ({
    ...cloneProperty(required(byId.get(id), `unknown property ${id}`)),
    position,
  }));
}

export function upsertPropertyOption(
  property: NoteProperty,
  option: NotePropertyOption,
): NoteProperty {
  assertOptionOwner(property.value.type);
  const index = property.options.findIndex((entry) => entry.id === option.id);
  const options =
    index < 0
      ? [...property.options, { ...option }]
      : property.options.map((entry, entryIndex) => (entryIndex === index ? { ...option } : entry));
  return normalizeOwnedProperty({ ...property, options });
}

export function createPropertyOption(
  property: NoteProperty,
  label: string,
  color: NotePropertyColor,
  idFactory: PropertyIdFactory,
): NoteProperty {
  return upsertPropertyOption(property, { id: idFactory("option"), label, color });
}

export function removePropertyOption(property: NoteProperty, optionId: string): NoteProperty {
  assertOptionOwner(property.value.type);
  if (!property.options.some((option) => option.id === optionId)) {
    throw propertyValidationError([`unknown property option ${optionId}`]);
  }
  const options = property.options.filter((option) => option.id !== optionId);
  let value: NotePropertyValue = property.value;
  if (value.type === "select" && value.value === optionId) {
    value = { ...value, value: null };
  }
  if (value.type === "multi-select") {
    value = { ...value, value: value.value.filter((id) => id !== optionId) };
  }
  return normalizeOwnedProperty({ ...property, value, options });
}

export function reorderPropertyOptions(
  property: NoteProperty,
  orderedIds: readonly string[],
): NoteProperty {
  assertOptionOwner(property.value.type);
  assertCompleteOrder(
    property.options.map((option) => option.id),
    orderedIds,
    "property option",
  );
  const byId = new Map(property.options.map((option) => [option.id, option]));
  return normalizeOwnedProperty({
    ...property,
    options: orderedIds.map((id) => ({ ...required(byId.get(id), `unknown option ${id}`) })),
  });
}

export function replacePropertyValue(
  property: NoteProperty,
  value: NotePropertyValue,
  context: PropertyValidationContext = {},
): NoteProperty {
  return normalizeOwnedProperty({ ...property, value }, context);
}

export function normalizeOwnedProperties(
  properties: readonly NoteProperty[],
  context: PropertyValidationContext = {},
): NoteProperty[] {
  if (properties.length === 0) return [];
  const noteId = assertSingleOwner(properties, properties[0]?.noteId ?? "");
  return normalizeNotePropertyFields(properties, context).map((field) => ({ noteId, ...field }));
}

function normalizeOwnedProperty(
  property: NoteProperty,
  context: PropertyValidationContext = {},
): NoteProperty {
  return { noteId: property.noteId, ...normalizeNotePropertyField(property, context) };
}

function assertSingleOwner(properties: readonly NoteProperty[], fallback: string): string {
  assertNoteId(fallback);
  if (properties.some((property) => property.noteId !== fallback)) {
    throw propertyValidationError(["properties contain a foreign note owner"]);
  }
  return fallback;
}

function assertNoteId(noteId: string): void {
  if (
    !noteId ||
    new TextEncoder().encode(noteId).length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(noteId)
  ) {
    throw propertyValidationError(["note ID is invalid"]);
  }
}

function assertCompleteOrder(
  currentIds: readonly string[],
  orderedIds: readonly string[],
  label: string,
): void {
  if (orderedIds.length !== currentIds.length) {
    throw propertyValidationError([`${label} reorder must contain the complete ID set`]);
  }
  const supplied = new Set(orderedIds);
  if (supplied.size !== orderedIds.length) {
    throw propertyValidationError([`${label} reorder contains duplicate IDs`]);
  }
  const current = new Set(currentIds);
  if (orderedIds.some((id) => !current.has(id))) {
    throw propertyValidationError([`${label} reorder contains foreign IDs`]);
  }
}

function assertOptionOwner(type: NotePropertyType): void {
  if (type !== "select" && type !== "multi-select") {
    throw propertyValidationError([`${type} properties cannot own options`]);
  }
}

function required<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) throw propertyValidationError([message]);
  return value;
}

function cloneProperty(property: NoteProperty): NoteProperty {
  return {
    ...property,
    value: cloneValue(property.value),
    options: property.options.map((option) => ({ ...option })),
  };
}

function cloneValue(value: NotePropertyValue): NotePropertyValue {
  if (Array.isArray(value.value)) return { ...value, value: [...value.value] } as NotePropertyValue;
  return { ...value };
}

function defaultPropertyName(type: NotePropertyType): string {
  if (type === "multi-select") return "Multi-select";
  return `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}`;
}
