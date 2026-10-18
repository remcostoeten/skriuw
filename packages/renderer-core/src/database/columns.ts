import type { NoteProperty, NotePropertyColor } from "../contracts/workspace";
import type { NotePropertyType } from "../properties/types";
import { normalizeEntityName } from "../search/query-parser";
import type { DatabaseRow } from "./rows";

export const BUILT_IN_COLUMN_KEYS = ["title", "folder", "created", "updated", "words"] as const;

export type BuiltInColumnKey = (typeof BUILT_IN_COLUMN_KEYS)[number];

export type DatabaseOption = {
  /** The folded label; option IDs differ per note, labels are what notes share. */
  key: string;
  label: string;
  color: NotePropertyColor;
};

export type DatabaseColumn =
  | { key: BuiltInColumnKey; name: string; kind: "built-in"; type: null; options: readonly [] }
  | {
      key: string;
      name: string;
      kind: "property";
      /** The type most notes store under this name; others show as mismatched. */
      type: NotePropertyType;
      options: readonly DatabaseOption[];
    };

export type PropertyColumn = Extract<DatabaseColumn, { kind: "property" }>;

const BUILT_IN_NAMES: Readonly<Record<BuiltInColumnKey, string>> = {
  title: "Name",
  folder: "Folder",
  created: "Created",
  updated: "Updated",
  words: "Words",
};

const lookupCache = new WeakMap<readonly NoteProperty[], ReadonlyMap<string, NoteProperty>>();

const FOLD_CACHE_LIMIT = 4096;
const foldCache = new Map<string, string>();

/** Folding runs per property per row on every projection, and names repeat across notes. */
function fold(text: string): string {
  let folded = foldCache.get(text);
  if (folded === undefined) {
    folded = normalizeEntityName(text);
    if (foldCache.size >= FOLD_CACHE_LIMIT) foldCache.clear();
    foldCache.set(text, folded);
  }
  return folded;
}

export function propertyColumnKey(name: string): string {
  return `p:${fold(name)}`;
}

export function foldOptionLabel(label: string): string {
  return fold(label);
}

export function isBuiltInColumnKey(key: string): key is BuiltInColumnKey {
  return (BUILT_IN_COLUMN_KEYS as readonly string[]).includes(key);
}

/** The note's property for a column: the lowest-positioned one carrying that name. */
export function rowProperty(row: DatabaseRow, columnKey: string): NoteProperty | null {
  let lookup = lookupCache.get(row.properties);
  if (lookup === undefined) {
    const built = new Map<string, NoteProperty>();
    for (const property of row.properties) {
      const key = propertyColumnKey(property.name);
      if (!built.has(key)) built.set(key, property);
    }
    lookupCache.set(row.properties, built);
    lookup = built;
  }
  return lookup.get(columnKey) ?? null;
}

/** The note's property for a column when it stores the column's type, else null. */
export function typedRowProperty(row: DatabaseRow, column: PropertyColumn): NoteProperty | null {
  const property = rowProperty(row, column.key);
  return property !== null && property.value.type === column.type ? property : null;
}

type Tally = {
  name: string;
  firstSeen: number;
  types: Map<NotePropertyType, { count: number; firstSeen: number }>;
  options: Map<string, { label: string; color: NotePropertyColor; rank: number; seen: number }>;
};

/**
 * Columns for the rows: the built-ins, then one column per folded property
 * name in the order names first appear. A column takes the type most notes
 * store under that name, and select options merge by folded label.
 */
export function discoverColumns(
  rows: readonly DatabaseRow[],
  includeFolder: boolean,
): DatabaseColumn[] {
  const tallies = new Map<string, Tally>();
  let seen = 0;
  for (const row of rows) {
    for (const property of row.properties) {
      const key = propertyColumnKey(property.name);
      let tally = tallies.get(key);
      if (tally === undefined) {
        tally = {
          name: property.name.trim(),
          firstSeen: seen,
          types: new Map(),
          options: new Map(),
        };
        tallies.set(key, tally);
      }
      const type = property.value.type;
      const typeTally = tally.types.get(type);
      if (typeTally) typeTally.count += 1;
      else tally.types.set(type, { count: 1, firstSeen: seen });
      property.options.forEach((option, rank) => {
        const optionKey = foldOptionLabel(option.label);
        const existing = tally!.options.get(optionKey);
        if (existing === undefined) {
          tally!.options.set(optionKey, {
            label: option.label,
            color: option.color,
            rank,
            seen,
          });
        } else if (rank < existing.rank) {
          existing.rank = rank;
        }
      });
      seen += 1;
    }
  }

  const leading: BuiltInColumnKey[] = includeFolder ? ["title", "folder"] : ["title"];
  const trailing: BuiltInColumnKey[] = ["created", "updated", "words"];

  const properties = [...tallies.entries()]
    .sort(([, left], [, right]) => left.firstSeen - right.firstSeen)
    .map(([key, tally]): DatabaseColumn => {
      const type = dominantType(tally);
      const options =
        type === "select" || type === "multi-select"
          ? [...tally.options.entries()]
              .sort(([, left], [, right]) => left.rank - right.rank || left.seen - right.seen)
              .map(([optionKey, option]) => ({
                key: optionKey,
                label: option.label,
                color: option.color,
              }))
          : [];
      return { key, name: tally.name, kind: "property", type, options };
    });
  return [...leading.map(builtInColumn), ...properties, ...trailing.map(builtInColumn)];
}

function builtInColumn(key: BuiltInColumnKey): DatabaseColumn {
  return { key, name: BUILT_IN_NAMES[key], kind: "built-in", type: null, options: [] };
}

function dominantType(tally: Tally): NotePropertyType {
  let best: NotePropertyType = "text";
  let bestCount = -1;
  let bestSeen = Number.POSITIVE_INFINITY;
  for (const [type, { count, firstSeen }] of tally.types) {
    if (count > bestCount || (count === bestCount && firstSeen < bestSeen)) {
      best = type;
      bestCount = count;
      bestSeen = firstSeen;
    }
  }
  return best;
}

const schemaCache = new WeakMap<readonly NoteProperty[], string>();

function schemaSignature(properties: readonly NoteProperty[]): string {
  let signature = schemaCache.get(properties);
  if (signature === undefined) {
    signature = JSON.stringify(
      properties.map((property) => [
        property.name,
        property.value.type,
        property.options.map((option) => [option.label, option.color]),
      ]),
    );
    schemaCache.set(properties, signature);
  }
  return signature;
}

/**
 * Whether `next` would discover the same columns as `previous`: the same notes
 * in the same order, with only property values changed. Lets a cell edit skip
 * rediscovering columns across every row.
 */
export function sameColumnSchema(
  previous: readonly DatabaseRow[],
  next: readonly DatabaseRow[],
): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    const before = previous[index]!;
    const after = next[index]!;
    if (before === after) continue;
    if (before.noteId !== after.noteId) return false;
    if (before.properties === after.properties) continue;
    if (schemaSignature(before.properties) !== schemaSignature(after.properties)) return false;
  }
  return true;
}

/** Whether two column lists render identically, so callers can keep the old array. */
export function sameColumns(
  left: readonly DatabaseColumn[],
  right: readonly DatabaseColumn[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((column, index) => {
    const other = right[index]!;
    return (
      column.key === other.key &&
      column.name === other.name &&
      column.type === other.type &&
      column.options.length === other.options.length &&
      column.options.every(
        (option, optionIndex) =>
          option.key === other.options[optionIndex]!.key &&
          option.label === other.options[optionIndex]!.label &&
          option.color === other.options[optionIndex]!.color,
      )
    );
  });
}

/**
 * Columns in display order: the saved order first, then anything newly
 * discovered, with the Name column always leading and never hidden.
 */
export function visibleColumns(
  columns: readonly DatabaseColumn[],
  order: readonly string[],
  hidden: readonly string[],
): DatabaseColumn[] {
  const hiddenSet = new Set(hidden);
  return orderedColumns(columns, order).filter(
    (column) => column.key === "title" || !hiddenSet.has(column.key),
  );
}

export function orderedColumns(
  columns: readonly DatabaseColumn[],
  order: readonly string[],
): DatabaseColumn[] {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const placed = new Set<string>(["title"]);
  const ordered: DatabaseColumn[] = [];
  const title = byKey.get("title");
  if (title) ordered.push(title);
  for (const key of order) {
    const column = byKey.get(key);
    if (column && !placed.has(key)) {
      placed.add(key);
      ordered.push(column);
    }
  }
  for (const column of columns) {
    if (!placed.has(column.key)) {
      placed.add(column.key);
      ordered.push(column);
    }
  }
  return ordered;
}
