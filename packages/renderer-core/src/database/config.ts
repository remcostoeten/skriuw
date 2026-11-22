import type { WorkspaceOperation, WorkspaceSettings } from "../contracts/workspace";

export const DATABASE_VIEWS_KEY = "databaseViews";
export const DATABASE_VIEWS_VERSION = 1;
export const WORKSPACE_SCOPE_KEY = "@workspace";
export const MAX_DATABASE_SCOPES = 100;
export const MAX_DATABASE_VIEW_BYTES = 64 * 1024;
export const DATABASE_VIEWS_BUDGET_BYTES = 240 * 1024;
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
 * @name databaseViewOperation
 * @description The operation that saves `view` as the scope's layout on every
 * device. Throws when the stored layouts belong to a newer version or the
 * layout is too large to save.
 * @example
 * commitOperations(store, [databaseViewOperation(settings, folderId, view)]);
 */
export function databaseViewOperation(
  settings: WorkspaceSettings,
  folderId: string | null,
  view: DatabaseView,
): WorkspaceOperation {
  const document = readStoredViews(settings[DATABASE_VIEWS_KEY]);
  if (document !== null && document.version > DATABASE_VIEWS_VERSION) {
    throw new Error("Database layouts were saved by a newer version of Skriuw.");
  }
  const normalized = normalizeDatabaseView(view);
  if (byteLength(JSON.stringify(normalized)) > MAX_DATABASE_VIEW_BYTES) {
    throw new Error("This database layout is too large to save.");
  }
  return { type: "set_database_view", folderId, view: normalized };
}

/**
 * @name withDatabaseView
 * @description Settings after one `set_database_view`; a `null` view clears
 * the scope. Scopes naming a folder `isFolder` rejects are dropped, the
 * changed scope comes first, and the rest are kept newest first, ties by key,
 * up to the scope count and byte budget. Layouts saved by a newer version are
 * left alone. Mirrors `merge_database_view` in
 * `crates/skriuw-domain/src/database_view.rs`, so the renderer and canonical
 * storage keep the same scopes.
 * @example
 * const next = withDatabaseView(settings, folderId, view, (id) => isFolder(state, id));
 */
export function withDatabaseView(
  settings: WorkspaceSettings,
  folderId: string | null,
  view: DatabaseView | null,
  isFolder: (folderId: string) => boolean,
): WorkspaceSettings {
  const stored = settings[DATABASE_VIEWS_KEY];
  const merged = mergeDatabaseView(stored, folderId, view, isFolder);
  return merged === stored ? settings : { ...settings, [DATABASE_VIEWS_KEY]: merged };
}

function mergeDatabaseView(
  stored: unknown,
  folderId: string | null,
  view: DatabaseView | null,
  isFolder: (folderId: string) => boolean,
): unknown {
  const document = stored === undefined ? null : readStoredViews(stored);
  if (document !== null && document.version > DATABASE_VIEWS_VERSION) return stored;
  const scopeKey = databaseScopeKey(folderId);
  function keepsScope(key: string): boolean {
    return key === WORKSPACE_SCOPE_KEY || isFolder(key);
  }
  const others = Object.entries(document?.views ?? {})
    .filter(([key, entry]) => key !== scopeKey && isRecord(entry) && keepsScope(key))
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        updatedAtOf(right) - updatedAtOf(left) || compareKeys(leftKey, rightKey),
    );
  let total = byteLength(JSON.stringify({ version: DATABASE_VIEWS_VERSION, views: {} }));
  const kept: [string, unknown][] = [];
  if (view !== null && keepsScope(scopeKey)) {
    total += entryBytes([scopeKey, view]);
    kept.push([scopeKey, view]);
  }
  for (const entry of others) {
    if (kept.length >= MAX_DATABASE_SCOPES) break;
    const size = entryBytes(entry);
    if (total + size > DATABASE_VIEWS_BUDGET_BYTES) break;
    total += size;
    kept.push(entry);
  }
  return { version: DATABASE_VIEWS_VERSION, views: Object.fromEntries(kept) };
}

function compareKeys(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function entryBytes([key, entry]: [string, unknown]): number {
  return byteLength(JSON.stringify(key)) + byteLength(JSON.stringify(entry)) + 2;
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
