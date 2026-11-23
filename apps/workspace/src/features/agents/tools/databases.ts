import type { NoteProperty, WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import {
  arrangeDatabase,
  defaultGroupColumn,
  isGroupableColumn,
} from "@skriuw/renderer-core/database/arrange";
import {
  BUILT_IN_COLUMN_KEYS,
  discoverColumns,
  isBuiltInColumnKey,
  orderedColumns,
  propertyColumnKey,
  type DatabaseColumn,
  type PropertyColumn,
} from "@skriuw/renderer-core/database/columns";
import {
  DATABASE_LAYOUTS,
  DATABASE_VIEWS_KEY,
  FILTER_OPERATORS,
  MAX_DATABASE_FILTERS,
  MAX_DATABASE_SORTS,
  databaseViewOperation,
  defaultDatabaseView,
  readDatabaseView,
  type DatabaseView,
} from "@skriuw/renderer-core/database/config";
import {
  createDatabaseRowsSelector,
  databaseScopeStatus,
} from "@skriuw/renderer-core/database/rows";
import {
  planCellWrite,
  planDatabaseNote,
  type CellPreset,
} from "@skriuw/renderer-core/database/writes";
import {
  removeNoteProperty,
  upsertNoteProperty,
} from "@skriuw/renderer-core/properties/operations";
import { emptyNotePropertyValue } from "@skriuw/renderer-core/properties/value";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { serializeProductMarkdown } from "@/features/editor/schema";
import { boundTitle } from "@/features/notes/title";
import type { ToolContext } from "../context";
import { refuse, type ToolInput } from "../protocol/input";
import type { JsonValue } from "../protocol/json";
import type { AgentTool } from "../protocol/server";
import {
  PROPERTY_TYPES,
  PROPERTY_VALUE_SCHEMA,
  cellInput,
  declaredColumn,
  propertyIdFactory,
  readableProperties,
  resolveColumn,
} from "../properties";
import {
  POSITIONS,
  editableNote,
  liveFolder,
  markdownDocument,
  nodePath,
  placement,
  titledMarkdown,
} from "../workspace";

const MAX_ROWS_PER_CALL = 200;
const MAX_ROWS_READ = 500;
const BUILT_IN_NAMES: Readonly<Record<(typeof BUILT_IN_COLUMN_KEYS)[number], string>> = {
  title: "Name",
  folder: "Folder",
  created: "Created",
  updated: "Updated",
  words: "Words",
};

const FOLDER_ID = {
  type: "string",
  minLength: 1,
  description: "Id of the database folder.",
} as const;
const CELLS = {
  type: "object",
  description: "Values keyed by column name.",
  additionalProperties: PROPERTY_VALUE_SCHEMA,
} as const;
const ROW = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    markdown: { type: "string", description: "Optional body for the row's note." },
    cells: CELLS,
  },
  required: ["title"],
  additionalProperties: false,
} as const;
const ROWS = { type: "array", items: ROW, minItems: 1, maxItems: MAX_ROWS_PER_CALL } as const;
const COLUMN = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    type: { type: "string", enum: PROPERTY_TYPES },
    options: {
      type: "array",
      items: { type: "string", minLength: 1 },
      description:
        "Option labels for select and multi-select, in order. On a board these are the lanes.",
    },
  },
  required: ["name", "type"],
  additionalProperties: false,
} as const;
const VIEW_PROPERTIES = {
  layout: { type: "string", enum: DATABASE_LAYOUTS },
  groupBy: {
    type: ["string", "null"],
    description: "Name of the select or checkbox column whose values become the board's lanes.",
  },
  sorts: {
    type: "array",
    maxItems: MAX_DATABASE_SORTS,
    items: {
      type: "object",
      properties: {
        column: { type: "string" },
        direction: { type: "string", enum: ["asc", "desc"] },
      },
      required: ["column", "direction"],
      additionalProperties: false,
    },
  },
  filters: {
    type: "array",
    maxItems: MAX_DATABASE_FILTERS,
    items: {
      type: "object",
      properties: {
        column: { type: "string" },
        operator: { type: "string", enum: FILTER_OPERATORS },
        value: { type: "string" },
      },
      required: ["column", "operator"],
      additionalProperties: false,
    },
  },
  hiddenColumns: { type: "array", items: { type: "string" } },
  includeSubfolders: { type: "boolean", description: "Show notes from subfolders as rows too." },
} as const;

/**
 * @name propertyWrites
 * @description The operations that set or clear properties on one note by
 * name, written the way a database cell edit writes them. A value of null
 * removes the property.
 *
 * @example
 * await context.commit(propertyWrites(context, "note-1", [["Status", "Doing"]]));
 */
export function propertyWrites(
  context: ToolContext,
  noteId: string,
  entries: readonly [string, JsonValue][],
): WorkspaceOperation[] {
  let state = context.store.getState();
  const note = editableNote(state, noteId);
  const database = note.parentId === null ? [] : scopeColumns(state, note.parentId);
  const createId = propertyIdFactory(context.createId);
  const at = context.now();
  const operations: WorkspaceOperation[] = [];
  for (const [rawName, value] of entries) {
    const name = rawName.trim();
    if (name.length === 0) refuse("Property names must not be empty.");
    const properties = state.propertiesByNoteId.get(noteId) ?? [];
    if (value === null) {
      const existing = properties.find(
        (property) => propertyColumnKey(property.name) === propertyColumnKey(name),
      );
      if (existing === undefined) continue;
      operations.push({ type: "remove_note_property", noteId, propertyId: existing.id, at });
      state = withProperties(state, noteId, removeNoteProperty(properties, existing.id));
      continue;
    }
    const column = resolveColumn(name, value, { note: properties, database });
    const write = planCellWrite(
      state,
      noteId,
      column,
      cellInput(column, value, state),
      at,
      createId,
    );
    if (write.status === "refused") refuse(`${name}: ${write.message}`);
    for (const operation of write.operations) {
      operations.push(operation);
      if (operation.type === "set_note_property") {
        state = withProperties(state, noteId, upsertNoteProperty(properties, operation.property));
      }
    }
  }
  return operations;
}

export const databaseTools: readonly AgentTool<ToolContext>[] = [
  {
    name: "read_database",
    title: "Read a database",
    description:
      "Reads a folder as a database: its layout (table or board), columns with their options, board lanes, and each note as a row of cell values. Any folder can be read this way.",
    inputSchema: {
      type: "object",
      properties: { folderId: FOLDER_ID },
      required: ["folderId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const folderId = databaseFolder(state, input.text("folderId"));
      const view = storedView(state, folderId);
      const rows = createDatabaseRowsSelector(folderId, view.subfolders)(state);
      const columns = orderedColumns(discoverColumns(rows, view.subfolders), view.order);
      const groupColumn =
        view.layout === "board"
          ? (columns.find(
              (column): column is PropertyColumn =>
                column.key === view.groupBy && isGroupableColumn(column),
            ) ?? defaultGroupColumn(columns))
          : null;
      const arranged = arrangeDatabase(
        rows,
        columns,
        { ...view, groupBy: groupColumn?.key ?? null },
        "",
        state.people,
      );
      const visibleRows = arranged.rows.filter((row) => !row.locked).slice(0, MAX_ROWS_READ);
      return {
        folderId,
        path: nodePath(state, folderId),
        layout: view.layout,
        groupBy: groupColumn?.name ?? null,
        includeSubfolders: view.subfolders,
        sorts: view.sorts.map((sort) => ({
          column: columnName(columns, sort.column),
          direction: sort.direction,
        })),
        filters: view.filters.map((filter) => ({
          column: columnName(columns, filter.column),
          operator: filter.operator,
          value: filter.value,
        })),
        hiddenColumns: view.hidden.map((key) => columnName(columns, key)),
        columns: columns
          .filter((column): column is PropertyColumn => column.kind === "property")
          .map((column) => ({
            name: column.name,
            type: column.type,
            options: column.options.map((option) => option.label),
          })),
        lanes:
          arranged.groups?.map((group) => ({
            lane: group.label,
            noteIds: group.rows.filter((row) => !row.locked).map((row) => row.noteId),
          })) ?? null,
        rowCount: arranged.rows.length,
        rows: visibleRows.map((row) => ({
          noteId: row.noteId,
          title: row.title,
          ...(row.folderPath.length > 0 ? { folder: row.folderPath } : {}),
          cells: readableProperties(state, row.noteId),
        })),
      };
    },
  },
  {
    name: "create_database",
    title: "Create a database",
    description:
      "Creates a folder shown as a table or a board, with typed columns and optional first rows. Every row is a note in the folder and every column is a note property. For a board, add a select column whose options are the lanes and name it in groupBy. Lanes appear once the board has rows.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        parentId: {
          type: ["string", "null"],
          description: "Folder to create the database in. Null or absent is the workspace root.",
        },
        position: { type: "string", enum: POSITIONS },
        layout: VIEW_PROPERTIES.layout,
        columns: { type: "array", items: COLUMN, maxItems: 32 },
        groupBy: VIEW_PROPERTIES.groupBy,
        rows: ROWS,
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(input, context) {
      const initial = context.store.getState();
      const parentId = liveFolder(initial, input.nullableString("parentId") ?? null);
      const columns = (input.optionalObjectList("columns") ?? []).map((column) =>
        declaredColumn(
          column.text("name"),
          column.choice("type", PROPERTY_TYPES),
          column.optionalStringList("options"),
        ),
      );
      const duplicate = columns.find(
        (column, index) => columns.findIndex((other) => other.key === column.key) !== index,
      );
      if (duplicate !== undefined) refuse(`Column "${duplicate.name}" is declared twice.`);
      const groupName = input.nullableString("groupBy") ?? null;
      const groupColumn =
        groupName === null
          ? null
          : (columns.find((column) => column.key === propertyColumnKey(groupName)) ?? null);
      if (groupName !== null && (groupColumn === null || !isGroupableColumn(groupColumn))) {
        refuse(
          `groupBy must name a declared select or checkbox column; "${groupName}" is not one.`,
        );
      }
      const layout =
        input.optionalChoice("layout", DATABASE_LAYOUTS) ??
        (groupColumn === null ? "table" : "board");
      const folderId = context.createId();
      const at = context.now();
      await context.commit([
        {
          type: "create_folder",
          id: folderId,
          title: boundTitle(input.text("title")),
          placement: placement(initial, parentId, {
            position: input.optionalChoice("position", POSITIONS),
          }),
          at,
        },
      ]);
      const created = context.store.getState();
      const view: DatabaseView = {
        ...defaultDatabaseView(folderId),
        layout,
        groupBy:
          groupColumn?.key ??
          (layout === "board" ? (defaultGroupColumn(columns)?.key ?? null) : null),
        updatedAt: at,
      };
      await context.commit([layoutOperation(created, folderId, view)]);
      const rows = input.optionalObjectList("rows") ?? [];
      const noteIds =
        rows.length === 0 ? [] : await addRows(context, folderId, rows, columns, true);
      return {
        folderId,
        path: nodePath(context.store.getState(), folderId),
        layout,
        groupBy:
          view.groupBy === null
            ? null
            : (columns.find((column) => column.key === view.groupBy)?.name ?? null),
        noteIds,
      };
    },
  },
  {
    name: "add_database_rows",
    title: "Add database rows",
    description:
      "Adds rows to a database folder. Each row becomes a note with the given cell values. On a board, set the lane column (for example Status) to place the card in a lane.",
    inputSchema: {
      type: "object",
      properties: { folderId: FOLDER_ID, rows: ROWS },
      required: ["folderId", "rows"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(input, context) {
      const state = context.store.getState();
      const folderId = databaseFolder(state, input.text("folderId"));
      const view = storedView(state, folderId);
      const columns = scopeColumns(state, folderId);
      const groupColumn =
        view.layout === "board"
          ? (columns.find(
              (column): column is PropertyColumn =>
                column.key === view.groupBy && isGroupableColumn(column),
            ) ?? defaultGroupColumn(columns))
          : null;
      const noteIds = await addRows(
        context,
        folderId,
        input.objectList("rows"),
        columns.filter((column): column is PropertyColumn => column.kind === "property"),
        false,
        groupColumn,
      );
      return { folderId, noteIds };
    },
  },
  {
    name: "set_properties",
    title: "Set note properties",
    description:
      "Sets property values on a note by name: a database cell, or moving a board card to another lane by changing its lane column. Existing columns keep their type; new ones take the type you give or one inferred from the value. null removes a property.",
    inputSchema: {
      type: "object",
      properties: { noteId: { type: "string", minLength: 1 }, properties: CELLS },
      required: ["noteId", "properties"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run(input, context) {
      const noteId = input.text("noteId");
      const entries = input.optionalEntries("properties") ?? [];
      if (entries.length === 0) refuse("Give at least one property.");
      await context.commit(propertyWrites(context, noteId, entries));
      return { noteId, properties: readableProperties(context.store.getState(), noteId) };
    },
  },
  {
    name: "configure_database",
    title: "Configure a database view",
    description:
      "Changes how a database folder is shown: table or board, the lane column, sorts, filters, hidden columns and whether subfolders count as rows. Only the fields given change. Columns are named as read_database reports them.",
    inputSchema: {
      type: "object",
      properties: { folderId: FOLDER_ID, ...VIEW_PROPERTIES },
      required: ["folderId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const folderId = databaseFolder(state, input.text("folderId"));
      const stored = readDatabaseView(state.settings[DATABASE_VIEWS_KEY], folderId);
      if (stored.readOnly)
        refuse(stored.problem ?? "This layout cannot be changed by this version of Skriuw.");
      const subfolders = input.optionalBoolean("includeSubfolders") ?? stored.view.subfolders;
      const columns = scopeColumns(state, folderId, subfolders);
      const next: DatabaseView = { ...stored.view, subfolders, updatedAt: context.now() };
      const layout = input.optionalChoice("layout", DATABASE_LAYOUTS);
      if (layout !== undefined) next.layout = layout;
      const groupBy = input.nullableString("groupBy");
      if (groupBy !== undefined) {
        const column = groupBy === null ? null : columnByName(columns, groupBy);
        if (column !== null && !isGroupableColumn(column))
          refuse(`${column.name} is not a select or checkbox column.`);
        next.groupBy = column?.key ?? null;
      }
      const sorts = input.optionalObjectList("sorts");
      if (sorts !== undefined) {
        next.sorts = sorts.map((sort) => ({
          column: columnByName(columns, sort.text("column")).key,
          direction: sort.choice("direction", ["asc", "desc"]),
        }));
      }
      const filters = input.optionalObjectList("filters");
      if (filters !== undefined) {
        next.filters = filters.map((filter) => ({
          column: columnByName(columns, filter.text("column")).key,
          operator: filter.choice("operator", FILTER_OPERATORS),
          value: filter.optionalString("value") ?? "",
        }));
      }
      const hidden = input.optionalStringList("hiddenColumns");
      if (hidden !== undefined) next.hidden = hidden.map((name) => columnByName(columns, name).key);
      await context.commit([layoutOperation(state, folderId, next)]);
      return {
        folderId,
        layout: next.layout,
        groupBy: next.groupBy === null ? null : columnName(columns, next.groupBy),
      };
    },
  },
];

function layoutOperation(
  state: RendererState,
  folderId: string,
  view: DatabaseView,
): WorkspaceOperation {
  try {
    return databaseViewOperation(state.settings, folderId, view);
  } catch (error) {
    refuse(error instanceof Error ? error.message : "That layout could not be saved.");
  }
}

async function addRows(
  context: ToolContext,
  folderId: string,
  rows: readonly ToolInput[],
  columns: readonly PropertyColumn[],
  fillDeclared: boolean,
  groupColumn: PropertyColumn | null = null,
): Promise<string[]> {
  const createId = propertyIdFactory(context.createId);
  const state = context.store.getState();
  const at = context.now();
  const operations: WorkspaceOperation[] = [];
  const noteIds: string[] = [];
  for (const row of rows) {
    const title = boundTitle(row.text("title"));
    const document = markdownDocument(titledMarkdown(title, row.optionalString("markdown") ?? ""));
    const cells = row.optionalEntries("cells") ?? [];
    const presets = new Map<string, CellPreset>();
    for (const column of columns) {
      if (fillDeclared || column.key === groupColumn?.key) {
        presets.set(column.key, {
          column,
          input:
            column.type === "select" || column.type === "multi-select"
              ? { kind: "labels", labels: [] }
              : { kind: "value", value: emptyNotePropertyValue(column.type) },
        });
      }
    }
    for (const [name, value] of cells) {
      if (value === null) continue;
      const column = resolveColumn(name, value, { note: [], database: columns });
      presets.set(column.key, { column, input: cellInput(column, value, state) });
    }
    const noteId = context.createId();
    const write = planDatabaseNote(
      state,
      folderId,
      title,
      { documentJson: document.toJSON(), markdown: serializeProductMarkdown(document) },
      [...presets.values()],
      at,
      noteId,
      createId,
    );
    if (write.status === "refused") refuse(`${title}: ${write.message}`);
    operations.push(
      ...write.operations.filter((operation) => operation.type !== "set_active_note"),
    );
    noteIds.push(noteId);
  }
  operations.push({ type: "set_active_note", noteId: state.activeNoteId });
  await context.commit(operations);
  return noteIds;
}

function databaseFolder(state: RendererState, folderId: string): string {
  const status = databaseScopeStatus(state, folderId);
  if (status === "journal") refuse("The journal cannot be used as a database.");
  if (status !== "ready") liveFolder(state, folderId);
  return folderId;
}

function storedView(state: RendererState, folderId: string): DatabaseView {
  return readDatabaseView(state.settings[DATABASE_VIEWS_KEY], folderId).view;
}

function scopeColumns(
  state: RendererState,
  folderId: string,
  subfolders = storedView(state, folderId).subfolders,
): DatabaseColumn[] {
  if (databaseScopeStatus(state, folderId) !== "ready") return [];
  return discoverColumns(createDatabaseRowsSelector(folderId, subfolders)(state), subfolders);
}

function columnByName(columns: readonly DatabaseColumn[], name: string): DatabaseColumn {
  const trimmed = name.trim();
  const builtIn = BUILT_IN_COLUMN_KEYS.find(
    (key) => key === trimmed || BUILT_IN_NAMES[key].toLowerCase() === trimmed.toLowerCase(),
  );
  const key = builtIn ?? propertyColumnKey(trimmed);
  const column = columns.find((candidate) => candidate.key === key);
  if (column === undefined) {
    const known = columns.map((candidate) => candidate.name).join(", ");
    refuse(`This database has no column "${trimmed}". Columns: ${known}.`);
  }
  return column;
}

function columnName(columns: readonly DatabaseColumn[], key: string): string {
  if (isBuiltInColumnKey(key)) return BUILT_IN_NAMES[key];
  return columns.find((column) => column.key === key)?.name ?? key;
}

function withProperties(
  state: RendererState,
  noteId: string,
  properties: readonly NoteProperty[],
): RendererState {
  return {
    ...state,
    propertiesByNoteId: new Map(state.propertiesByNoteId).set(noteId, properties),
  };
}
