import type { NotePropertyColor } from "../contracts/workspace";
import type { NotePropertyType } from "../properties/types";
import type { PersonRecord } from "../references/types";
import { normalizeEntityName } from "../search/query-parser";
import {
  foldOptionLabel,
  typedRowProperty,
  type DatabaseColumn,
  type PropertyColumn,
} from "./columns";
import type { DatabaseFilter, DatabaseView, FilterOperator } from "./config";
import type { DatabaseRow } from "./rows";

export type CellValue =
  | { kind: "text"; text: string }
  | { kind: "number"; value: number | null }
  | { kind: "date"; key: string }
  | { kind: "options"; keys: readonly string[] }
  | { kind: "people"; ids: readonly string[] }
  | { kind: "checkbox"; value: boolean };

export type DatabaseGroup = {
  /** Folded option label, `"checked"`/`"unchecked"`, or null for notes without a value. */
  key: string | null;
  label: string;
  color: NotePropertyColor | null;
  rows: readonly DatabaseRow[];
};

export type ArrangedDatabase = {
  rows: readonly DatabaseRow[];
  groups: readonly DatabaseGroup[] | null;
  /** Filters that name a column this scope no longer has, so the view can say so. */
  inactiveFilters: readonly DatabaseFilter[];
};

type ValueKind = CellValue["kind"];

const TEXT_OPERATORS: readonly FilterOperator[] = [
  "contains",
  "not-contains",
  "is",
  "is-not",
  "empty",
  "not-empty",
];
const NUMBER_OPERATORS: readonly FilterOperator[] = [
  "is",
  "is-not",
  "greater",
  "less",
  "empty",
  "not-empty",
];
const DATE_OPERATORS: readonly FilterOperator[] = ["is", "before", "after", "empty", "not-empty"];
const SELECT_OPERATORS: readonly FilterOperator[] = ["is", "is-not", "empty", "not-empty"];
const LIST_OPERATORS: readonly FilterOperator[] = [
  "contains",
  "not-contains",
  "empty",
  "not-empty",
];
const CHECKBOX_OPERATORS: readonly FilterOperator[] = ["checked", "unchecked"];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function columnValueKind(column: DatabaseColumn): ValueKind {
  if (column.kind === "built-in") {
    if (column.key === "created" || column.key === "updated") return "date";
    if (column.key === "words") return "number";
    return "text";
  }
  return propertyValueKind(column.type);
}

function propertyValueKind(type: NotePropertyType): ValueKind {
  switch (type) {
    case "number":
    case "rating":
      return "number";
    case "date":
      return "date";
    case "select":
    case "multi-select":
      return "options";
    case "person":
      return "people";
    case "checkbox":
      return "checkbox";
    default:
      return "text";
  }
}

export function filterOperators(column: DatabaseColumn): readonly FilterOperator[] {
  if (column.kind === "property" && column.type === "select") return SELECT_OPERATORS;
  switch (columnValueKind(column)) {
    case "number":
      return NUMBER_OPERATORS;
    case "date":
      return DATE_OPERATORS;
    case "options":
    case "people":
      return LIST_OPERATORS;
    case "checkbox":
      return CHECKBOX_OPERATORS;
    default:
      return TEXT_OPERATORS;
  }
}

export function operatorNeedsValue(operator: FilterOperator): boolean {
  return (
    operator !== "empty" &&
    operator !== "not-empty" &&
    operator !== "checked" &&
    operator !== "unchecked"
  );
}

export function isGroupableColumn(column: DatabaseColumn): column is PropertyColumn {
  return column.kind === "property" && (column.type === "select" || column.type === "checkbox");
}

/** The comparable value a row holds for a column. Mismatched types read as empty. */
export function cellValue(row: DatabaseRow, column: DatabaseColumn): CellValue {
  if (column.kind === "built-in") {
    switch (column.key) {
      case "title":
        return { kind: "text", text: row.title };
      case "folder":
        return { kind: "text", text: row.folderPath };
      case "created":
        return { kind: "date", key: localDateKey(row.createdAt) };
      case "updated":
        return { kind: "date", key: localDateKey(row.updatedAt) };
      case "words":
        return { kind: "number", value: row.wordCount };
    }
  }
  const property = typedRowProperty(row, column);
  const kind = propertyValueKind(column.type);
  if (property === null) return emptyValue(kind);
  const value = property.value;
  switch (value.type) {
    case "number":
    case "rating":
      return { kind: "number", value: value.value };
    case "date":
      return { kind: "date", key: value.value };
    case "select": {
      const option = property.options.find((entry) => entry.id === value.value);
      return { kind: "options", keys: option ? [foldOptionLabel(option.label)] : [] };
    }
    case "multi-select": {
      const labels = new Map(property.options.map((entry) => [entry.id, entry.label]));
      return {
        kind: "options",
        keys: value.value.flatMap((id) => {
          const label = labels.get(id);
          return label === undefined ? [] : [foldOptionLabel(label)];
        }),
      };
    }
    case "person":
      return { kind: "people", ids: value.value };
    case "checkbox":
      return { kind: "checkbox", value: value.value };
    default:
      return { kind: "text", text: value.value };
  }
}

function emptyValue(kind: ValueKind): CellValue {
  switch (kind) {
    case "number":
      return { kind, value: null };
    case "date":
      return { kind, key: "" };
    case "options":
      return { kind, keys: [] };
    case "people":
      return { kind, ids: [] };
    case "checkbox":
      return { kind, value: false };
    default:
      return { kind: "text", text: "" };
  }
}

export function isEmptyValue(value: CellValue): boolean {
  switch (value.kind) {
    case "text":
      return value.text.trim().length === 0;
    case "number":
      return value.value === null;
    case "date":
      return value.key.length === 0;
    case "options":
      return value.keys.length === 0;
    case "people":
      return value.ids.length === 0;
    case "checkbox":
      return !value.value;
  }
}

export function matchesFilter(
  row: DatabaseRow,
  column: DatabaseColumn,
  filter: DatabaseFilter,
): boolean {
  const value = cellValue(row, column);
  const { operator } = filter;
  if (operator === "empty") return isEmptyValue(value);
  if (operator === "not-empty") return !isEmptyValue(value);
  if (operator === "checked") return value.kind === "checkbox" && value.value;
  if (operator === "unchecked") return value.kind === "checkbox" && !value.value;
  const target = filter.value.trim();
  if (target.length === 0) return true;
  switch (value.kind) {
    case "text": {
      const haystack = normalizeEntityName(value.text);
      const needle = normalizeEntityName(target);
      if (operator === "contains") return haystack.includes(needle);
      if (operator === "not-contains") return !haystack.includes(needle);
      if (operator === "is") return haystack === needle;
      if (operator === "is-not") return haystack !== needle;
      return true;
    }
    case "number": {
      const wanted = Number(target);
      if (!Number.isFinite(wanted)) return true;
      if (operator === "is-not") return value.value !== wanted;
      if (value.value === null) return false;
      if (operator === "is") return value.value === wanted;
      if (operator === "greater") return value.value > wanted;
      if (operator === "less") return value.value < wanted;
      return true;
    }
    case "date": {
      if (operator === "is") return value.key === target;
      if (value.key.length === 0) return false;
      if (operator === "before") return value.key < target;
      if (operator === "after") return value.key > target;
      return true;
    }
    case "options": {
      const key = foldOptionLabel(target);
      const has = value.keys.includes(key);
      if (operator === "is" || operator === "contains") return has;
      if (operator === "is-not" || operator === "not-contains") return !has;
      return true;
    }
    case "people": {
      const has = value.ids.includes(target);
      if (operator === "contains") return has;
      if (operator === "not-contains") return !has;
      return true;
    }
    case "checkbox":
      return true;
  }
}

type PreparedSort = {
  column: DatabaseColumn;
  descending: boolean;
  emptiesSort: boolean;
  ranks: ReadonlyMap<string, number>;
};

function compareValues(
  left: CellValue,
  right: CellValue,
  sort: PreparedSort,
  people: ReadonlyMap<string, PersonRecord>,
): number {
  if (left.kind === "text" && right.kind === "text") return collator.compare(left.text, right.text);
  if (left.kind === "number" && right.kind === "number") {
    return (left.value ?? 0) - (right.value ?? 0);
  }
  if (left.kind === "date" && right.kind === "date") {
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  }
  if (left.kind === "options" && right.kind === "options") {
    return optionRank(left.keys, sort.ranks) - optionRank(right.keys, sort.ranks);
  }
  if (left.kind === "people" && right.kind === "people") {
    return collator.compare(firstPersonName(left.ids, people), firstPersonName(right.ids, people));
  }
  if (left.kind === "checkbox" && right.kind === "checkbox") {
    return Number(left.value) - Number(right.value);
  }
  return 0;
}

function optionRank(keys: readonly string[], ranks: ReadonlyMap<string, number>): number {
  return keys.length === 0 ? Number.MAX_SAFE_INTEGER : (ranks.get(keys[0]!) ?? ranks.size);
}

function firstPersonName(
  ids: readonly string[],
  people: ReadonlyMap<string, PersonRecord>,
): string {
  const id = ids[0];
  return id === undefined ? "" : (people.get(id)?.name ?? "");
}

type DecoratedRow = { row: DatabaseRow; values: readonly CellValue[] };

function decorateRow(row: DatabaseRow, sorts: readonly PreparedSort[]): DecoratedRow {
  return { row, values: sorts.map((sort) => cellValue(row, sort.column)) };
}

function compareDecorated(
  left: DecoratedRow,
  right: DecoratedRow,
  sorts: readonly PreparedSort[],
  people: ReadonlyMap<string, PersonRecord>,
): number {
  for (let index = 0; index < sorts.length; index += 1) {
    const sort = sorts[index]!;
    const leftValue = left.values[index]!;
    const rightValue = right.values[index]!;
    const leftEmpty = sort.emptiesSort && isEmptyValue(leftValue);
    const rightEmpty = sort.emptiesSort && isEmptyValue(rightValue);
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
    if (leftEmpty) continue;
    const compared = compareValues(leftValue, rightValue, sort, people);
    if (compared !== 0) return sort.descending ? -compared : compared;
  }
  return left.row.treeIndex - right.row.treeIndex;
}

function sortRows(
  rows: readonly DatabaseRow[],
  sorts: readonly PreparedSort[],
  people: ReadonlyMap<string, PersonRecord>,
): DatabaseRow[] {
  const decorated = rows.map((row) => decorateRow(row, sorts));
  decorated.sort((left, right) => compareDecorated(left, right, sorts, people));
  return decorated.map((entry) => entry.row);
}

/** Where `row` belongs in `sorted`, which is already in arranged order. */
function insertionIndex(
  sorted: readonly DatabaseRow[],
  row: DatabaseRow,
  sorts: readonly PreparedSort[],
  people: ReadonlyMap<string, PersonRecord>,
): number {
  const target = decorateRow(row, sorts);
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareDecorated(decorateRow(sorted[middle]!, sorts), target, sorts, people) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

const CHECKED_KEY = "checked";
const UNCHECKED_KEY = "unchecked";

/** The group key a row lands in; null is the no-value group. */
function groupKeyOf(
  row: DatabaseRow,
  column: PropertyColumn,
  knownKeys: ReadonlySet<string>,
): string | null {
  const value = cellValue(row, column);
  if (column.type === "checkbox") {
    return value.kind === "checkbox" && value.value ? CHECKED_KEY : UNCHECKED_KEY;
  }
  const key = value.kind === "options" ? value.keys[0] : undefined;
  return key !== undefined && knownKeys.has(key) ? key : null;
}

function groupKeys(column: PropertyColumn): ReadonlySet<string> {
  return new Set(column.options.map((option) => option.key));
}

function groupShells(column: PropertyColumn): Omit<DatabaseGroup, "rows">[] {
  if (column.type === "checkbox") {
    return [
      { key: UNCHECKED_KEY, label: `Not ${column.name.toLowerCase()}`, color: null },
      { key: CHECKED_KEY, label: column.name, color: null },
    ];
  }
  return [
    { key: null, label: `No ${column.name}`, color: null },
    ...column.options.map((option) => ({
      key: option.key,
      label: option.label,
      color: option.color,
    })),
  ];
}

/** Groups for a board, in option order, with empty groups kept as drop targets. */
export function groupRows(rows: readonly DatabaseRow[], column: PropertyColumn): DatabaseGroup[] {
  const known = groupKeys(column);
  const buckets = new Map<string | null, DatabaseRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row, column, known);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return groupShells(column).map((shell) => ({ ...shell, rows: buckets.get(shell.key) ?? [] }));
}

type Arrangement = {
  activeFilters: { column: DatabaseColumn; filter: DatabaseFilter }[];
  inactiveFilters: DatabaseFilter[];
  needle: string;
  sorts: PreparedSort[];
  groupColumn: PropertyColumn | null;
};

function prepareArrangement(
  columns: readonly DatabaseColumn[],
  view: DatabaseView,
  search: string,
): Arrangement {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const inactiveFilters: DatabaseFilter[] = [];
  const activeFilters: { column: DatabaseColumn; filter: DatabaseFilter }[] = [];
  for (const filter of view.filters) {
    const column = byKey.get(filter.column);
    if (column === undefined || !filterOperators(column).includes(filter.operator)) {
      inactiveFilters.push(filter);
    } else {
      activeFilters.push({ column, filter });
    }
  }
  const sorts = view.sorts.flatMap((sort): PreparedSort[] => {
    const column = byKey.get(sort.column);
    if (column === undefined) return [];
    return [
      {
        column,
        descending: sort.direction === "desc",
        emptiesSort: columnValueKind(column) !== "checkbox",
        ranks: new Map(column.options.map((option, index) => [option.key, index])),
      },
    ];
  });
  const groupColumn = view.groupBy === null ? undefined : byKey.get(view.groupBy);
  return {
    activeFilters,
    inactiveFilters,
    needle: normalizeEntityName(search),
    sorts,
    groupColumn:
      view.layout === "board" && groupColumn !== undefined && isGroupableColumn(groupColumn)
        ? groupColumn
        : null,
  };
}

function rowPasses(arrangement: Arrangement, row: DatabaseRow): boolean {
  return (
    (arrangement.needle.length === 0 ||
      normalizeEntityName(row.title).includes(arrangement.needle)) &&
    arrangement.activeFilters.every(({ column, filter }) => matchesFilter(row, column, filter))
  );
}

/**
 * Applies the quick search, filters (all must match), sorts and board
 * grouping. Ties keep tree order so the result is stable between renders.
 */
export function arrangeDatabase(
  rows: readonly DatabaseRow[],
  columns: readonly DatabaseColumn[],
  view: DatabaseView,
  search: string,
  people: ReadonlyMap<string, PersonRecord>,
): ArrangedDatabase {
  const arrangement = prepareArrangement(columns, view, search);
  let arranged = rows.filter((row) => rowPasses(arrangement, row));
  if (arrangement.sorts.length > 0) arranged = sortRows(arranged, arrangement.sorts, people);
  return {
    rows: arranged,
    groups: arrangement.groupColumn === null ? null : groupRows(arranged, arrangement.groupColumn),
    inactiveFilters: arrangement.inactiveFilters,
  };
}

/** What a finished arrangement was computed from, kept to update it in place. */
export type ArrangedSnapshot = {
  rows: readonly DatabaseRow[];
  columns: readonly DatabaseColumn[];
  view: DatabaseView;
  search: string;
  people: ReadonlyMap<string, PersonRecord>;
  arranged: ArrangedDatabase;
};

const INCREMENTAL_ROW_LIMIT = 32;

function withoutRows(
  rows: readonly DatabaseRow[],
  removed: ReadonlySet<DatabaseRow>,
): DatabaseRow[] {
  return rows.filter((row) => !removed.has(row));
}

function insertRows(
  sorted: DatabaseRow[],
  inserted: readonly DatabaseRow[],
  arrangement: Arrangement,
  people: ReadonlyMap<string, PersonRecord>,
): void {
  for (const row of inserted) {
    sorted.splice(insertionIndex(sorted, row, arrangement.sorts, people), 0, row);
  }
}

/**
 * The result of `arrangeDatabase` for `rows`, derived from a previous result
 * when only a few rows changed in place (same notes, same order, same columns,
 * view, search and people). Only the changed rows are refiltered and
 * reinserted, so a cell edit does not refilter and resort every note. Anything
 * else falls back to a full arrange.
 */
export function rearrangeDatabase(
  previous: ArrangedSnapshot,
  rows: readonly DatabaseRow[],
  columns: readonly DatabaseColumn[],
  view: DatabaseView,
  search: string,
  people: ReadonlyMap<string, PersonRecord>,
): ArrangedDatabase {
  if (
    previous.columns !== columns ||
    previous.view !== view ||
    previous.search !== search ||
    previous.people !== people ||
    previous.rows.length !== rows.length
  ) {
    return arrangeDatabase(rows, columns, view, search, people);
  }
  const removed = new Set<DatabaseRow>();
  const changed: DatabaseRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const before = previous.rows[index]!;
    const after = rows[index]!;
    if (before === after) continue;
    if (before.noteId !== after.noteId || changed.length >= INCREMENTAL_ROW_LIMIT) {
      return arrangeDatabase(rows, columns, view, search, people);
    }
    removed.add(before);
    changed.push(after);
  }
  if (changed.length === 0) return previous.arranged;

  const arrangement = prepareArrangement(columns, view, search);
  const passing = changed.filter((row) => rowPasses(arrangement, row));
  const arrangedRows = withoutRows(previous.arranged.rows, removed);
  insertRows(arrangedRows, passing, arrangement, people);

  let groups: readonly DatabaseGroup[] | null = null;
  const { groupColumn } = arrangement;
  if (groupColumn !== null && previous.arranged.groups !== null) {
    const known = groupKeys(groupColumn);
    const arrivals = new Map<string | null, DatabaseRow[]>();
    for (const row of passing) {
      const key = groupKeyOf(row, groupColumn, known);
      const bucket = arrivals.get(key);
      if (bucket) bucket.push(row);
      else arrivals.set(key, [row]);
    }
    groups = previous.arranged.groups.map((group) => {
      const arriving = arrivals.get(group.key) ?? [];
      const leaving = group.rows.some((row) => removed.has(row));
      if (!leaving && arriving.length === 0) return group;
      const grouped = withoutRows(group.rows, removed);
      insertRows(grouped, arriving, arrangement, people);
      return { ...group, rows: grouped };
    });
  }
  return { rows: arrangedRows, groups, inactiveFilters: previous.arranged.inactiveFilters };
}

/** The first column a board can group by, preferring one named like a status. */
export function defaultGroupColumn(columns: readonly DatabaseColumn[]): PropertyColumn | null {
  const groupable = columns.filter(isGroupableColumn);
  return (
    groupable.find(
      (column) => column.type === "select" && /status|stage|state/i.test(column.name),
    ) ??
    groupable.find((column) => column.type === "select") ??
    groupable[0] ??
    null
  );
}

export function localDateKey(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
