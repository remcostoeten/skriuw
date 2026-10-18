import type { WorkspaceSettings } from "../contracts/workspace";

export const DATABASE_VIEWS_KEY = "databaseViews";
export const DATABASE_VIEWS_VERSION = 1;
export const WORKSPACE_SCOPE_KEY = "@workspace";
export const MAX_DATABASE_SCOPES = 100;
/** Below the domain's 256 KiB cap on the stored document, leaving room for encoding differences. */
export const MAX_DATABASE_VIEWS_BYTES = 240 * 1024;
export const MAX_DATABASE_SORTS = 3;
export const MAX_DATABASE_FILTERS = 8;

const MAX_COLUMN_KEYS = 128;
const MAX_KEY_LENGTH = 200;
const MAX_FILTER_VALUE_LENGTH = 200;

export const DATABASE_LAYOUTS = ["table", "board"] as const;
export const FILTER_OPERATORS = [
  "contains",
  "not-contains",
  "is",
  "is-not",
  "empty",
  "not-empty",
  "greater",
  "less",
  "before",
  "after",
  "checked",
  "unchecked",
] as const;

export type DatabaseLayout = (typeof DATABASE_LAYOUTS)[number];
export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export type SortDirection = "asc" | "desc";

export type DatabaseSort = { column: string; direction: SortDirection };

export type DatabaseFilter = { column: string; operator: FilterOperator; value: string };

export type DatabaseView = {
  layout: DatabaseLayout;
  subfolders: boolean;
  order: readonly string[];
  hidden: readonly string[];
  sorts: readonly DatabaseSort[];
  filters: readonly DatabaseFilter[];
  groupBy: string | null;
  updatedAt: number;
};

export type DatabaseViewRead = {
  view: DatabaseView;
  problem: string | null;
  readOnly: boolean;
};

type StoredViews = { version: number; views: Record<string, unknown> };

const LAYOUT_SET = new Set<string>(DATABASE_LAYOUTS);
const OPERATOR_SET = new Set<string>(FILTER_OPERATORS);

export function databaseScopeKey(folderId: string | null): string {
  return folderId ?? WORKSPACE_SCOPE_KEY;
}

export function defaultDatabaseView(folderId: string | null): DatabaseView {
  return {
    layout: "table",
    subfolders: folderId === null,
    order: [],
    hidden: ["created", "words"],
    sorts: [],
    filters: [],
    groupBy: null,
    updatedAt: 0,
  };
}

/**
 * The saved layout for one scope. A missing entry is the default view; an
 * unreadable one is reported and replaced by defaults for display, and a
 * document saved by a newer version is shown read-only so this build never
 * overwrites it.
 */
export function readDatabaseView(stored: unknown, folderId: string | null): DatabaseViewRead {
  const fallback = defaultDatabaseView(folderId);
  if (stored === undefined) return { view: fallback, problem: null, readOnly: false };
  const document = readStoredViews(stored);
  if (document === null) {
    return {
      view: fallback,
      problem: "Saved database layouts are unreadable. Changing this layout starts them over.",
      readOnly: false,
    };
  }
  if (document.version > DATABASE_VIEWS_VERSION) {
    return {
      view: fallback,
      problem: "These layouts were saved by a newer version of Skriuw.",
      readOnly: true,
    };
  }
  const entry = document.views[databaseScopeKey(folderId)];
  if (entry === undefined) return { view: fallback, problem: null, readOnly: false };
  const view = parseDatabaseView(entry);
  if (view === null) {
    return {
      view: fallback,
      problem: "This database's saved layout is unreadable. Changing it starts a new one.",
      readOnly: false,
    };
  }
  return { view, problem: null, readOnly: false };
}

/**
 * Returns settings carrying `view` for the scope. Entries for folders that no
 * longer exist are dropped, and the least recently changed scopes are evicted
 * past the scope count or the stored size cap. Throws when the stored
 * document belongs to a newer version.
 */
export function withDatabaseView(
  settings: WorkspaceSettings,
  folderId: string | null,
  view: DatabaseView,
  folderExists: (folderId: string) => boolean,
): WorkspaceSettings {
  const stored = settings[DATABASE_VIEWS_KEY];
  const document = stored === undefined ? { version: 1, views: {} } : readStoredViews(stored);
  if (document !== null && document.version > DATABASE_VIEWS_VERSION) {
    throw new Error("Database layouts were saved by a newer version of Skriuw.");
  }
  const scopeKey = databaseScopeKey(folderId);
  const entries = Object.entries(document?.views ?? {}).filter(
    ([key, entry]) =>
      key !== scopeKey &&
      (key === WORKSPACE_SCOPE_KEY || folderExists(key)) &&
      parseDatabaseView(entry) !== null,
  );
  const current: [string, unknown] = [scopeKey, normalizeDatabaseView(view)];
  const others = entries
    .sort(([, left], [, right]) => updatedAtOf(right) - updatedAtOf(left))
    .slice(0, MAX_DATABASE_SCOPES - 1);
  const sizes = others.map((entry) => entryBytes(entry));
  let total = byteLength(JSON.stringify({ version: DATABASE_VIEWS_VERSION, views: {} }));
  total += entryBytes(current);
  if (total > MAX_DATABASE_VIEWS_BYTES)
    throw new Error("This database layout is too large to save.");
  let keep = 0;
  while (keep < others.length && total + 1 + sizes[keep]! <= MAX_DATABASE_VIEWS_BYTES) {
    total += 1 + sizes[keep]!;
    keep += 1;
  }
  return {
    ...settings,
    [DATABASE_VIEWS_KEY]: {
      version: DATABASE_VIEWS_VERSION,
      views: Object.fromEntries([current, ...others.slice(0, keep)]),
    },
  };
}

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function entryBytes([key, entry]: [string, unknown]): number {
  return byteLength(`${JSON.stringify(key)}:${JSON.stringify(entry)}`);
}

export function normalizeDatabaseView(view: DatabaseView): DatabaseView {
  const parsed = parseDatabaseView(view);
  if (parsed === null) throw new Error("Database layout is invalid.");
  return parsed;
}

function updatedAtOf(entry: unknown): number {
  return isRecord(entry) && typeof entry.updatedAt === "number" ? entry.updatedAt : 0;
}

function readStoredViews(value: unknown): StoredViews | null {
  if (!isRecord(value) || typeof value.version !== "number" || !isRecord(value.views)) {
    return null;
  }
  return { version: value.version, views: value.views };
}

function parseDatabaseView(value: unknown): DatabaseView | null {
  if (!isRecord(value)) return null;
  const { layout, subfolders, order, hidden, sorts, filters, groupBy, updatedAt } = value;
  if (typeof layout !== "string" || !LAYOUT_SET.has(layout)) return null;
  if (typeof subfolders !== "boolean") return null;
  if (!isKeyList(order) || !isKeyList(hidden)) return null;
  if (groupBy !== null && !isKey(groupBy)) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  const parsedSorts = parseSorts(sorts);
  const parsedFilters = parseFilters(filters);
  if (parsedSorts === null || parsedFilters === null) return null;
  return {
    layout: layout as DatabaseLayout,
    subfolders,
    order: [...order],
    hidden: [...hidden],
    sorts: parsedSorts,
    filters: parsedFilters,
    groupBy,
    updatedAt,
  };
}

function parseSorts(value: unknown): DatabaseSort[] | null {
  if (!Array.isArray(value) || value.length > MAX_DATABASE_SORTS) return null;
  const sorts: DatabaseSort[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isKey(entry.column)) return null;
    if (entry.direction !== "asc" && entry.direction !== "desc") return null;
    sorts.push({ column: entry.column, direction: entry.direction });
  }
  return sorts;
}

function parseFilters(value: unknown): DatabaseFilter[] | null {
  if (!Array.isArray(value) || value.length > MAX_DATABASE_FILTERS) return null;
  const filters: DatabaseFilter[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isKey(entry.column)) return null;
    if (typeof entry.operator !== "string" || !OPERATOR_SET.has(entry.operator)) return null;
    if (typeof entry.value !== "string" || entry.value.length > MAX_FILTER_VALUE_LENGTH) {
      return null;
    }
    filters.push({
      column: entry.column,
      operator: entry.operator as FilterOperator,
      value: entry.value,
    });
  }
  return filters;
}

function isKeyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_COLUMN_KEYS && value.every(isKey);
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
