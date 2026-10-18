import { useCallback, useMemo, useRef, useState } from "react";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import {
  arrangeDatabase,
  defaultGroupColumn,
  isGroupableColumn,
  type ArrangedDatabase,
} from "@skriuw/renderer-core/database/arrange";
import {
  discoverColumns,
  orderedColumns,
  sameColumnSchema,
  sameColumns,
  visibleColumns,
  type DatabaseColumn,
  type PropertyColumn,
} from "@skriuw/renderer-core/database/columns";
import {
  DATABASE_VIEWS_KEY,
  readDatabaseView,
  withDatabaseView,
  type DatabaseView,
} from "@skriuw/renderer-core/database/config";
import {
  createDatabaseRowsSelector,
  databaseScopeStatus,
  type DatabaseRow,
  type DatabaseScopeStatus,
} from "@skriuw/renderer-core/database/rows";
import {
  impliedPresets,
  planCellWrite,
  planDatabaseNote,
  type CellInput,
  type DatabaseWrite,
} from "@skriuw/renderer-core/database/writes";
import type { PersonRecord } from "@skriuw/renderer-core/references/types";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { createBrowserPropertyIdFactory } from "@/features/note-chrome/property-editing";
import { titledNoteDocument } from "@/features/notes/operations";
import { boundTitle } from "@/features/notes/title";
import { commitOperations } from "@/store/commit";

export type DatabaseModel = {
  status: DatabaseScopeStatus;
  title: string;
  rows: readonly DatabaseRow[];
  columns: readonly DatabaseColumn[];
  visible: readonly DatabaseColumn[];
  arranged: ArrangedDatabase;
  view: DatabaseView;
  groupColumn: PropertyColumn | null;
  problem: string | null;
  readOnly: boolean;
  people: ReadonlyMap<string, PersonRecord>;
  search: string;
  setSearch: (search: string) => void;
  notice: string | null;
  setNotice: (notice: string | null) => void;
  updateView: (patch: Partial<DatabaseView>) => void;
  writeCell: (noteId: string, column: PropertyColumn, input: CellInput) => void;
  createNote: (title: string, groupKey?: string | null) => string | null;
};

type Discovery = {
  rows: readonly DatabaseRow[];
  includeFolder: boolean;
  columns: readonly DatabaseColumn[];
};

function selectPeople(state: RendererState): ReadonlyMap<string, PersonRecord> {
  return state.people;
}

function selectStoredViews(state: RendererState): unknown {
  return state.settings[DATABASE_VIEWS_KEY];
}

/**
 * Everything one database screen reads and writes. Rows come from a narrow
 * memoized selector; columns are rediscovered only when rows change and kept
 * when they come out the same, so a value edit re-renders one row.
 */
export function useDatabase(store: RendererStore, folderId: string | null): DatabaseModel {
  const storedViews = useRendererSelector(store, selectStoredViews);
  const read = useMemo(() => readDatabaseView(storedViews, folderId), [storedViews, folderId]);
  const storedView = read.view;
  const selectStatus = useCallback(
    (state: RendererState) => databaseScopeStatus(state, folderId),
    [folderId],
  );
  const status = useRendererSelector(store, selectStatus);
  const selectTitle = useCallback(
    (state: RendererState) =>
      folderId === null
        ? "All notes"
        : (state.nodes.get(folderId)?.title ?? state.sourceNodes.get(folderId)?.title ?? "Folder"),
    [folderId],
  );
  const title = useRendererSelector(store, selectTitle);
  const selectRows = useMemo(
    () => createDatabaseRowsSelector(folderId, storedView.subfolders),
    [folderId, storedView.subfolders],
  );
  const rows = useRendererSelector(store, selectRows);
  const people = useRendererSelector(store, selectPeople);

  const includeFolder = folderId === null || storedView.subfolders;
  const discovery = useRef<Discovery | null>(null);
  const discovered = useMemo(() => {
    const previous = discovery.current;
    if (
      previous !== null &&
      previous.includeFolder === includeFolder &&
      sameColumnSchema(previous.rows, rows)
    ) {
      discovery.current = { ...previous, rows };
      return previous.columns;
    }
    const next = discoverColumns(rows, includeFolder);
    const columns =
      previous !== null && sameColumns(previous.columns, next) ? previous.columns : next;
    discovery.current = { rows, includeFolder, columns };
    return columns;
  }, [rows, includeFolder]);
  const previousColumns = useRef<readonly DatabaseColumn[]>([]);
  const columns = useMemo(() => {
    const ordered = orderedColumns(discovered, storedView.order);
    if (sameColumns(previousColumns.current, ordered)) return previousColumns.current;
    previousColumns.current = ordered;
    return ordered;
  }, [discovered, storedView.order]);
  const visible = useMemo(
    () => visibleColumns(columns, storedView.order, storedView.hidden),
    [columns, storedView.order, storedView.hidden],
  );
  const groupColumn = useMemo(() => {
    if (storedView.layout !== "board") return null;
    const chosen = columns.find((column) => column.key === storedView.groupBy);
    return chosen !== undefined && isGroupableColumn(chosen) ? chosen : defaultGroupColumn(columns);
  }, [columns, storedView.layout, storedView.groupBy]);
  const view = useMemo(
    () =>
      storedView.layout === "board" && storedView.groupBy !== (groupColumn?.key ?? null)
        ? { ...storedView, groupBy: groupColumn?.key ?? null }
        : storedView,
    [storedView, groupColumn],
  );

  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const arranged = useMemo(
    () => arrangeDatabase(rows, columns, view, search, people),
    [rows, columns, view, search, people],
  );
  const idFactory = useMemo(createBrowserPropertyIdFactory, []);

  const commit = useCallback(
    (write: DatabaseWrite): boolean => {
      if (write.status === "refused") {
        setNotice(write.message);
        return false;
      }
      setNotice(null);
      if (write.operations.length === 0) return true;
      commitOperations(store, write.operations).catch((error: unknown) => {
        console.error("database write rejected", error);
        setNotice("That change could not be saved.");
      });
      return true;
    },
    [store],
  );

  const updateView = useCallback(
    (patch: Partial<DatabaseView>) => {
      const state = store.getState();
      const current = readDatabaseView(state.settings[DATABASE_VIEWS_KEY], folderId);
      if (current.readOnly) {
        setNotice(current.problem);
        return;
      }
      let settings: RendererState["settings"];
      try {
        settings = withDatabaseView(
          state.settings,
          folderId,
          { ...current.view, ...patch, updatedAt: Date.now() },
          (id) => state.sourceNodes.has(id),
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "That layout could not be saved.");
        return;
      }
      const operations: WorkspaceOperation[] = [{ type: "update_settings", settings }];
      commitOperations(store, operations).catch((error: unknown) => {
        console.error("database layout rejected", error);
        setNotice("That layout could not be saved.");
      });
    },
    [store, folderId],
  );

  const writeCell = useCallback(
    (noteId: string, column: PropertyColumn, input: CellInput) => {
      commit(planCellWrite(store.getState(), noteId, column, input, Date.now(), idFactory));
    },
    [commit, store, idFactory],
  );

  const createNote = useCallback(
    (rawTitle: string, groupKey?: string | null): string | null => {
      const noteTitle = boundTitle(rawTitle);
      const noteId = crypto.randomUUID();
      const presets = impliedPresets(columns, view, groupKey);
      const write = planDatabaseNote(
        store.getState(),
        folderId,
        noteTitle,
        titledNoteDocument(noteTitle),
        presets,
        Date.now(),
        noteId,
        idFactory,
      );
      return commit(write) ? noteId : null;
    },
    [columns, view, store, folderId, idFactory, commit],
  );

  return {
    status,
    title,
    rows,
    columns,
    visible,
    arranged,
    view,
    groupColumn,
    problem: read.problem,
    readOnly: read.readOnly,
    people,
    search,
    setSearch,
    notice,
    setNotice,
    updateView,
    writeCell,
    createNote,
  };
}
