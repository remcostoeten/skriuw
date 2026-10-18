import type { NotePropertyColor } from "@skriuw/renderer-core/contracts/workspace";
import { rowProperty, type DatabaseColumn } from "@skriuw/renderer-core/database/columns";
import type { DatabaseRow } from "@skriuw/renderer-core/database/rows";
import type { NotePropertyType } from "@skriuw/renderer-core/properties/types";
import type { PersonRecord } from "@skriuw/renderer-core/references/types";

export type CellDisplay =
  | { kind: "empty" }
  | { kind: "text"; text: string; numeric?: boolean }
  | { kind: "options"; options: readonly { label: string; color: NotePropertyColor }[] }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "rating"; value: number }
  | { kind: "mismatch"; text: string; storedType: NotePropertyType };

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDateKey(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? key : dateFormat.format(date);
}

export function formatTimestamp(timestamp: number): string {
  return timestamp > 0 ? dateFormat.format(new Date(timestamp)) : "";
}

/** What a cell shows. A property stored under another type shows its raw value, muted. */
export function cellDisplay(
  row: DatabaseRow,
  column: DatabaseColumn,
  people: ReadonlyMap<string, PersonRecord>,
): CellDisplay {
  if (column.kind === "built-in") {
    switch (column.key) {
      case "title":
        return { kind: "text", text: row.title.trim() || "Untitled" };
      case "folder":
        return row.folderPath ? { kind: "text", text: row.folderPath } : { kind: "empty" };
      case "created":
        return { kind: "text", text: formatTimestamp(row.createdAt) };
      case "updated":
        return { kind: "text", text: formatTimestamp(row.updatedAt) };
      case "words":
        return row.wordCount === null
          ? { kind: "text", text: "Locked" }
          : { kind: "text", text: String(row.wordCount), numeric: true };
    }
  }
  const property = rowProperty(row, column.key);
  if (property === null) {
    return column.type === "checkbox" ? { kind: "checkbox", checked: false } : { kind: "empty" };
  }
  const value = property.value;
  const display = propertyDisplay(property.options, value, people);
  if (value.type !== column.type) {
    return {
      kind: "mismatch",
      text: displayText(display),
      storedType: value.type,
    };
  }
  return display;
}

function propertyDisplay(
  options: readonly { id: string; label: string; color: NotePropertyColor }[],
  value: NonNullable<ReturnType<typeof rowProperty>>["value"],
  people: ReadonlyMap<string, PersonRecord>,
): CellDisplay {
  switch (value.type) {
    case "number":
      return value.value === null
        ? { kind: "empty" }
        : { kind: "text", text: value.value.toLocaleString(), numeric: true };
    case "rating":
      return value.value === null || value.value === 0
        ? { kind: "empty" }
        : { kind: "rating", value: value.value };
    case "checkbox":
      return { kind: "checkbox", checked: value.value };
    case "date":
      return value.value ? { kind: "text", text: formatDateKey(value.value) } : { kind: "empty" };
    case "select":
    case "multi-select": {
      const ids =
        value.type === "select" ? (value.value === null ? [] : [value.value]) : value.value;
      const chosen = ids.flatMap((id) => {
        const option = options.find((entry) => entry.id === id);
        return option ? [{ label: option.label, color: option.color }] : [];
      });
      return chosen.length === 0 ? { kind: "empty" } : { kind: "options", options: chosen };
    }
    case "person": {
      const names = value.value.flatMap((id) => {
        const person = people.get(id);
        return person ? [person.name] : [];
      });
      return names.length === 0 ? { kind: "empty" } : { kind: "text", text: names.join(", ") };
    }
    default:
      return value.value.trim() ? { kind: "text", text: value.value } : { kind: "empty" };
  }
}

/** The cell as plain words, for labels and screen readers. */
export function displayText(display: CellDisplay): string {
  switch (display.kind) {
    case "empty":
      return "Empty";
    case "text":
    case "mismatch":
      return display.text;
    case "options":
      return display.options.map((option) => option.label).join(", ");
    case "checkbox":
      return display.checked ? "Checked" : "Not checked";
    case "rating":
      return `${display.value} of 5`;
  }
}
