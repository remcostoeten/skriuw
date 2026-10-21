import type { NoteProperty } from "../contracts/workspace";
import { JOURNAL_ROOT_ID } from "../journal/constants";
import type { RendererState } from "../store/types";

export type DatabaseScopeStatus = "ready" | "missing" | "trashed" | "journal" | "not-folder";

export type DatabaseRow = {
  noteId: string;
  title: string;
  parentId: string | null;
  /** Folder titles between the scope and the note, joined for display. Empty at the scope. */
  folderPath: string;
  treeIndex: number;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  /** Null while the body is withheld by a note lock. */
  wordCount: number | null;
  /** The store's own array, so an untouched note keeps its identity. */
  properties: readonly NoteProperty[];
};

const EMPTY_PROPERTIES: readonly NoteProperty[] = [];

const ROW_INPUTS = [
  "nodes",
  "childrenByParent",
  "sourceNodes",
  "metadata",
  "documents",
  "propertiesByNoteId",
] as const satisfies readonly (keyof RendererState)[];

/** Whether `folderId` can be opened as a database; null is the whole workspace. */
export function databaseScopeStatus(
  state: RendererState,
  folderId: string | null,
): DatabaseScopeStatus {
  if (folderId === null) return "ready";
  if (folderId === JOURNAL_ROOT_ID) return "journal";
  const node = state.nodes.get(folderId);
  if (node) return node.kind === "folder" ? "ready" : "not-folder";
  const source = state.sourceNodes.get(folderId);
  if (!source) return "missing";
  return source.kind === "folder" ? "trashed" : "not-folder";
}

type RowInputs = {
  source: ReturnType<RendererState["sourceNodes"]["get"]>;
  metadata: ReturnType<RendererState["metadata"]["get"]>;
  document: ReturnType<RendererState["documents"]["get"]>;
  properties: readonly NoteProperty[];
};

type RowEntry = RowInputs & { row: DatabaseRow };

function readRowInputs(state: RendererState, noteId: string): RowInputs {
  return {
    source: state.sourceNodes.get(noteId),
    metadata: state.metadata.get(noteId),
    document: state.documents.get(noteId),
    properties: state.propertiesByNoteId.get(noteId) ?? EMPTY_PROPERTIES,
  };
}

function sameRowInputs(left: RowInputs, right: RowInputs): boolean {
  return (
    left.source === right.source &&
    left.metadata === right.metadata &&
    left.document === right.document &&
    left.properties === right.properties
  );
}

/**
 * A selector over the notes in one scope, in tree order. The previous result
 * is returned while the maps it reads keep their identity, and a row object is
 * reused while its fields are unchanged, so an edit to one note hands React a
 * single new row and unrelated store updates hand it nothing. While the tree
 * itself is untouched, which is every property or content edit, membership and
 * order are kept and only rows whose own inputs changed are rebuilt.
 */
export function createDatabaseRowsSelector(
  folderId: string | null,
  subfolders: boolean,
): (state: RendererState) => readonly DatabaseRow[] {
  let lastState: RendererState | null = null;
  let lastRows: readonly DatabaseRow[] = [];
  let entries: RowEntry[] = [];

  function rebuild(state: RendererState): readonly DatabaseRow[] {
    const previous = new Map(entries.map((entry) => [entry.row.noteId, entry.row]));
    const nextEntries: RowEntry[] = [];
    const rows: DatabaseRow[] = [];
    let changed = false;
    collectScope(state, folderId, subfolders, (noteId, parentId, folderPath) => {
      const inputs = readRowInputs(state, noteId);
      const built = buildRow(state, noteId, inputs, parentId, folderPath, rows.length);
      const earlier = previous.get(noteId);
      const row = earlier !== undefined && sameRow(earlier, built) ? earlier : built;
      if (lastRows[rows.length] !== row) changed = true;
      nextEntries.push({ ...inputs, row });
      rows.push(row);
    });
    entries = nextEntries;
    if (changed || rows.length !== lastRows.length) lastRows = rows;
    return lastRows;
  }

  function refresh(state: RendererState): readonly DatabaseRow[] {
    let rows: DatabaseRow[] | null = null;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      const inputs = readRowInputs(state, entry.row.noteId);
      if (sameRowInputs(entry, inputs)) continue;
      const built = buildRow(
        state,
        entry.row.noteId,
        inputs,
        entry.row.parentId,
        entry.row.folderPath,
        entry.row.treeIndex,
      );
      entry.source = inputs.source;
      entry.metadata = inputs.metadata;
      entry.document = inputs.document;
      entry.properties = inputs.properties;
      if (sameRow(entry.row, built)) continue;
      entry.row = built;
      rows ??= lastRows.slice();
      rows[index] = built;
    }
    if (rows !== null) lastRows = rows;
    return lastRows;
  }

  return function selectDatabaseRows(state) {
    const previous = lastState;
    lastState = state;
    if (previous === null) return rebuild(state);
    if (ROW_INPUTS.every((input) => previous[input] === state[input])) return lastRows;
    if (previous.nodes === state.nodes && previous.childrenByParent === state.childrenByParent) {
      return refresh(state);
    }
    return rebuild(state);
  };
}

function collectScope(
  state: RendererState,
  folderId: string | null,
  subfolders: boolean,
  visit: (noteId: string, parentId: string | null, folderPath: string) => void,
): void {
  if (databaseScopeStatus(state, folderId) !== "ready") return;
  function walk(parentId: string | null, path: string): void {
    for (const childId of state.childrenByParent.get(parentId) ?? []) {
      const child = state.nodes.get(childId);
      if (!child || childId === JOURNAL_ROOT_ID) continue;
      if (child.kind === "note") {
        visit(childId, parentId, path);
      } else if (subfolders) {
        walk(childId, path ? `${path} / ${child.title}` : child.title);
      }
    }
  }
  walk(folderId, "");
}

function buildRow(
  state: RendererState,
  noteId: string,
  inputs: RowInputs,
  parentId: string | null,
  folderPath: string,
  treeIndex: number,
): DatabaseRow {
  const { source, metadata } = inputs;
  const sealed = (inputs.document?.sealed ?? null) !== null;
  return {
    noteId,
    title: metadata?.title ?? state.nodes.get(noteId)?.title ?? "",
    parentId,
    folderPath,
    treeIndex,
    locked: (source?.lockedAt ?? null) !== null,
    createdAt: source?.createdAt ?? 0,
    updatedAt: metadata?.updatedAt ?? source?.updatedAt ?? 0,
    wordCount: sealed ? null : (metadata?.wordCount ?? 0),
    properties: inputs.properties,
  };
}

function sameRow(left: DatabaseRow, right: DatabaseRow): boolean {
  return (
    left.title === right.title &&
    left.parentId === right.parentId &&
    left.folderPath === right.folderPath &&
    left.treeIndex === right.treeIndex &&
    left.locked === right.locked &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.wordCount === right.wordCount &&
    left.properties === right.properties
  );
}
