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

/**
 * A selector over the notes in one scope, in tree order. The previous result
 * is returned while the maps it reads keep their identity, and a row object is
 * reused while its fields are unchanged, so an edit to one note hands React a
 * single new row and unrelated store updates hand it nothing.
 */
export function createDatabaseRowsSelector(
  folderId: string | null,
  subfolders: boolean,
): (state: RendererState) => readonly DatabaseRow[] {
  let lastState: RendererState | null = null;
  let lastRows: readonly DatabaseRow[] = [];
  let cache = new Map<string, DatabaseRow>();

  return function selectDatabaseRows(state) {
    if (lastState !== null && ROW_INPUTS.every((input) => lastState![input] === state[input])) {
      return lastRows;
    }
    lastState = state;
    const nextCache = new Map<string, DatabaseRow>();
    const rows: DatabaseRow[] = [];
    let changed = false;
    collectScope(state, folderId, subfolders, (noteId, parentId, folderPath) => {
      const built = buildRow(state, noteId, parentId, folderPath, rows.length);
      const previous = cache.get(noteId);
      const row = previous !== undefined && sameRow(previous, built) ? previous : built;
      if (lastRows[rows.length] !== row) changed = true;
      nextCache.set(noteId, row);
      rows.push(row);
    });
    cache = nextCache;
    if (changed || rows.length !== lastRows.length) lastRows = rows;
    return lastRows;
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
  parentId: string | null,
  folderPath: string,
  treeIndex: number,
): DatabaseRow {
  const source = state.sourceNodes.get(noteId);
  const metadata = state.metadata.get(noteId);
  const sealed = (state.documents.get(noteId)?.sealed ?? null) !== null;
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
    properties: state.propertiesByNoteId.get(noteId) ?? EMPTY_PROPERTIES,
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
