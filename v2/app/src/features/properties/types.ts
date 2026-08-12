export const NOTE_PROPERTY_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "multi-select",
  "person",
  "url",
  "checkbox",
  "rating",
  "location",
  "email",
  "phone",
] as const;

export const NOTE_PROPERTY_COLORS = [
  "gray",
  "stone",
  "amber",
  "green",
  "blue",
  "teal",
  "rose",
  "red",
] as const;

export type NotePropertyType = ContractNotePropertyValue["type"];
export type NotePropertyColor = ContractNotePropertyColor;
export type NotePropertyValue = ContractNotePropertyValue;
export type NotePropertyOption = ContractNotePropertyOption;
export type NotePropertyField = ContractNotePropertyField;
export type NoteProperty = ContractNoteProperty;
export type NotePropertyTemplate = ContractNotePropertyTemplate;

export type PropertyIdFactory = (kind: "property" | "option") => string;
import type {
  NoteProperty as ContractNoteProperty,
  NotePropertyColor as ContractNotePropertyColor,
  NotePropertyField as ContractNotePropertyField,
  NotePropertyOption as ContractNotePropertyOption,
  NotePropertyTemplate as ContractNotePropertyTemplate,
  NotePropertyValue as ContractNotePropertyValue,
} from "@/contracts/workspace";
