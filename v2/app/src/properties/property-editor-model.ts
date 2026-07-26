import type {
  NoteProperty,
  NotePropertyColor,
  NotePropertyTemplate,
  NotePropertyValue,
  WorkspaceOperation,
} from "../contracts/workspace";
import { createNoteProperty } from "./operations";
import { instantiatePropertyTemplate } from "./templates";
import type { PropertyIdFactory } from "./types";

type NotePropertyType = NotePropertyValue["type"];

export const PROPERTY_TYPE_LABELS: Readonly<Record<NotePropertyType, string>> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  "multi-select": "Multi-select",
  person: "Person",
  url: "URL",
  checkbox: "Checkbox",
  rating: "Rating",
  location: "Location",
  email: "Email",
  phone: "Phone",
};

export const PROPERTY_COLOR_LABELS: Readonly<Record<NotePropertyColor, string>> = {
  gray: "Gray",
  stone: "Stone",
  amber: "Amber",
  green: "Green",
  blue: "Blue",
  teal: "Teal",
  rose: "Rose",
  red: "Red",
};

export function createBrowserPropertyIdFactory(): PropertyIdFactory {
  return (kind) => `${kind}_${crypto.randomUUID()}`;
}

export function addPropertyOperations(
  noteId: string,
  properties: readonly NoteProperty[],
  type: NotePropertyType,
  name: string,
  at: number,
  createId: PropertyIdFactory,
): WorkspaceOperation[] {
  const property = createNoteProperty(
    noteId,
    type,
    createId,
    name.trim() || PROPERTY_TYPE_LABELS[type],
    properties.length,
  );
  return [{ type: "set_note_property", property, at }];
}

export function updatePropertyOperations(
  property: NoteProperty,
  at: number,
): WorkspaceOperation[] {
  return [{ type: "set_note_property", property, at }];
}

export function deletePropertyOperations(
  property: NoteProperty,
  at: number,
): WorkspaceOperation[] {
  return [
    {
      type: "remove_note_property",
      noteId: property.noteId,
      propertyId: property.id,
      at,
    },
  ];
}

export function reorderPropertyOperations(
  properties: readonly NoteProperty[],
  propertyId: string,
  offset: -1 | 1,
  at: number,
): WorkspaceOperation[] {
  const currentIndex = properties.findIndex((property) => property.id === propertyId);
  const nextIndex = currentIndex + offset;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= properties.length) return [];
  const ids = properties.map((property) => property.id);
  const currentId = ids[currentIndex];
  const nextId = ids[nextIndex];
  if (!currentId || !nextId) return [];
  ids[currentIndex] = nextId;
  ids[nextIndex] = currentId;
  return [
    {
      type: "reorder_note_properties",
      noteId: properties[currentIndex]?.noteId ?? "",
      orderedPropertyIds: ids,
      at,
    },
  ];
}

export function applyTemplateOperations(
  noteId: string,
  properties: readonly NoteProperty[],
  template: NotePropertyTemplate,
  at: number,
  createId: PropertyIdFactory,
): WorkspaceOperation[] {
  const instantiated = instantiatePropertyTemplate(template, noteId, createId);
  return [
    ...properties.map(
      (property): WorkspaceOperation => ({
        type: "remove_note_property",
        noteId,
        propertyId: property.id,
        at,
      }),
    ),
    ...instantiated.map(
      (property): WorkspaceOperation => ({ type: "set_note_property", property, at }),
    ),
  ];
}

export function replaceStringValue(
  value: NotePropertyValue,
  nextValue: string,
): NotePropertyValue {
  if (
    value.type !== "text" &&
    value.type !== "date" &&
    value.type !== "url" &&
    value.type !== "location" &&
    value.type !== "email" &&
    value.type !== "phone"
  ) {
    return value;
  }
  return { ...value, value: nextValue };
}

export function parseOptionalNumber(value: string): number | null | undefined {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function propertyErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The property change could not be saved.";
}
