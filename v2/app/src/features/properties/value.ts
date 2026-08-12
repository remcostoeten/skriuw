import {
  NOTE_PROPERTY_COLORS,
  NOTE_PROPERTY_TYPES,
  type NotePropertyField,
  type NotePropertyOption,
  type NotePropertyType,
  type NotePropertyValue,
} from "./types";

const MAX_ID_BYTES = 128;
const MAX_NAME_BYTES = 80;
const MAX_VALUE_BYTES = 2_000;
const MAX_OPTIONS = 64;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROPERTY_TYPE_SET = new Set<string>(NOTE_PROPERTY_TYPES);
const PROPERTY_COLOR_SET = new Set<string>(NOTE_PROPERTY_COLORS);

export type PropertyValidationContext = {
  personIds?: ReadonlySet<string>;
};

export type PropertyValidationError = Error & {
  issues: readonly string[];
};

export function propertyValidationError(issues: readonly string[]): PropertyValidationError {
  const error = new Error(issues.join("; ")) as PropertyValidationError;
  error.name = "PropertyValidationError";
  error.issues = issues;
  return error;
}

export function isPropertyValidationError(error: unknown): error is PropertyValidationError {
  return error instanceof Error && error.name === "PropertyValidationError";
}

export function emptyNotePropertyValue(type: NotePropertyType): NotePropertyValue {
  switch (type) {
    case "number":
      return { valueVersion: 1, type, value: null };
    case "select":
      return { valueVersion: 1, type, value: null };
    case "multi-select":
      return { valueVersion: 1, type, value: [] };
    case "person":
      return { valueVersion: 1, type, value: [] };
    case "checkbox":
      return { valueVersion: 1, type, value: false };
    case "rating":
      return { valueVersion: 1, type, value: null };
    default:
      return { valueVersion: 1, type, value: "" };
  }
}

export function normalizeNotePropertyValue(
  input: unknown,
  options: readonly NotePropertyOption[] = [],
  context: PropertyValidationContext = {},
): NotePropertyValue {
  const issues: string[] = [];
  if (!isRecord(input)) throw propertyValidationError(["property value must be an object"]);
  if (input.valueVersion !== 1) issues.push("property value version must be 1");
  if (typeof input.type !== "string" || !PROPERTY_TYPE_SET.has(input.type)) {
    issues.push("property value type is unsupported");
  }
  if (issues.length > 0) throw propertyValidationError(issues);

  const type = input.type as NotePropertyType;
  const optionIds = new Set(options.map((option) => option.id));
  const value = input.value;
  switch (type) {
    case "text":
    case "date":
    case "url":
    case "location":
    case "email":
    case "phone":
      if (typeof value !== "string") issues.push(`${type} value must be a string`);
      else if (byteLength(value) > MAX_VALUE_BYTES) issues.push(`${type} value is too long`);
      break;
    case "number":
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        issues.push("number value must be finite or null");
      }
      break;
    case "select":
      if (value !== null && !isValidId(value)) issues.push("select value must be an option ID or null");
      else if (typeof value === "string" && !optionIds.has(value)) {
        issues.push(`select value references unknown option ${value}`);
      }
      break;
    case "multi-select":
      validateIdList(value, "multi-select", issues);
      if (Array.isArray(value)) {
        for (const id of value) {
          if (typeof id === "string" && !optionIds.has(id)) {
            issues.push(`multi-select value references unknown option ${id}`);
          }
        }
      }
      break;
    case "person":
      validateIdList(value, "person", issues);
      if (Array.isArray(value)) {
        const personIds = context.personIds ?? new Set<string>();
        for (const id of value) {
          if (typeof id === "string" && !personIds.has(id)) {
            issues.push(`person value references unknown person ${id}`);
          }
        }
      }
      break;
    case "checkbox":
      if (typeof value !== "boolean") issues.push("checkbox value must be boolean");
      break;
    case "rating":
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5)
      ) {
        issues.push("rating value must be an integer from 0 through 5 or null");
      }
      break;
  }
  if (issues.length > 0) throw propertyValidationError(issues);
  if (Array.isArray(value)) return { valueVersion: 1, type, value: [...value] } as NotePropertyValue;
  return { valueVersion: 1, type, value } as NotePropertyValue;
}

export function normalizeNotePropertyField(
  input: unknown,
  context: PropertyValidationContext = {},
): NotePropertyField {
  if (!isRecord(input)) throw propertyValidationError(["property must be an object"]);
  const issues: string[] = [];
  const id = readId(input.id, "property ID", issues);
  const name = readName(input.name, "property name", MAX_NAME_BYTES, issues);
  const position = readPosition(input.position, "property", issues);
  const options = normalizeOptions(input.options, issues);
  if (issues.length > 0) throw propertyValidationError(issues);
  const value = normalizeNotePropertyValue(input.value, options, context);
  if (value.type !== "select" && value.type !== "multi-select" && options.length > 0) {
    throw propertyValidationError([`${value.type} properties cannot own options`]);
  }
  return { id, name, value, options, position };
}

export function normalizeNotePropertyFields(
  input: unknown,
  context: PropertyValidationContext = {},
): NotePropertyField[] {
  if (!Array.isArray(input)) throw propertyValidationError(["properties must be an array"]);
  if (input.length > 64) throw propertyValidationError(["properties exceed 64 entries"]);
  const fields = input.map((field) => normalizeNotePropertyField(field, context));
  assertUnique(fields.map((field) => field.id), "property IDs");
  assertUnique(fields.map((field) => field.position), "property positions");
  const positions = fields.map((field) => field.position).sort((left, right) => left - right);
  if (positions.some((position, index) => position !== index)) {
    throw propertyValidationError(["property positions must be contiguous from zero"]);
  }
  return fields.sort((left, right) => left.position - right.position);
}

function normalizeOptions(input: unknown, issues: string[]): NotePropertyOption[] {
  if (!Array.isArray(input)) {
    issues.push("property options must be an array");
    return [];
  }
  if (input.length > MAX_OPTIONS) issues.push(`property options exceed ${MAX_OPTIONS} entries`);
  const options = input.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`property option ${index} must be an object`);
      return [];
    }
    const id = readId(entry.id, `property option ${index} ID`, issues);
    const label = readName(entry.label, `property option ${index} label`, MAX_NAME_BYTES, issues);
    if (typeof entry.color !== "string" || !PROPERTY_COLOR_SET.has(entry.color)) {
      issues.push(`property option ${index} color is unsupported`);
      return [];
    }
    return [{ id, label, color: entry.color as NotePropertyOption["color"] }];
  });
  assertUnique(options.map((option) => option.id), "property option IDs", issues);
  return options;
}

function validateIdList(value: unknown, label: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${label} value must be an array`);
    return;
  }
  if (value.length > MAX_OPTIONS) issues.push(`${label} value exceeds ${MAX_OPTIONS} entries`);
  const ids: string[] = [];
  value.forEach((id, index) => {
    if (!isValidId(id)) issues.push(`${label} value ${index} is not a valid ID`);
    else ids.push(id);
  });
  assertUnique(ids, `${label} value IDs`, issues);
}

function readId(value: unknown, label: string, issues: string[]): string {
  if (!isValidId(value)) {
    issues.push(`${label} is invalid`);
    return "";
  }
  return value;
}

function readName(value: unknown, label: string, maximum: number, issues: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${label} cannot be empty`);
    return "";
  }
  if (byteLength(value) > maximum) issues.push(`${label} is too long`);
  return value;
}

function readPosition(value: unknown, label: string, issues: string[]): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    issues.push(`${label} position must be a non-negative integer`);
    return 0;
  }
  return value;
}

function isValidId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    byteLength(value) <= MAX_ID_BYTES &&
    ID_PATTERN.test(value)
  );
}

function assertUnique(
  values: readonly (string | number)[],
  label: string,
  issues?: string[],
): void {
  const unique = new Set(values);
  if (unique.size === values.length) return;
  const message = `${label} contain duplicates`;
  if (issues) issues.push(message);
  else throw propertyValidationError([message]);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
