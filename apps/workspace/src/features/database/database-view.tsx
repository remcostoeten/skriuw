import "./database.css";
import { useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { DatabaseScopeStatus } from "@skriuw/renderer-core/database/rows";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { renameNode } from "@/features/notes/operations";
import { activateReference } from "@/features/references/shell";
import { COMPACT_EMPTY_STATE_STYLE, EMPTY_STATE_COLORS } from "@/shared/empty-state/app-theme";
import { EmptyState, type EmptyStateAction } from "@/shared/empty-state/empty-state";
import { IconStack, SearchIllustration } from "@/shared/empty-state/illustrations";
import { CloseIcon, DatabaseIcon } from "@/shared/icons/static";
import { DatabaseBoard } from "./view/board";
import { DatabaseTable } from "./view/table";
import { DatabaseToolbar } from "./view/toolbar";
import { useDatabase } from "./view/use-database";

type Props = {
  store: RendererStore;
  folderId: string | null;
  windowControls: ReactNode;
  sidebarToggle: ReactNode;
};

const UNAVAILABLE: Readonly<Record<Exclude<DatabaseScopeStatus, "ready">, string>> = {
  missing: "This folder no longer exists.",
  trashed: "This folder is in the trash. Restore it to open it as a database.",
  journal: "Journal entries are organized by date, so the journal does not open as a database.",
  "not-folder": "Only folders open as a database.",
};

const keyHintClass =
  "m-0 flex flex-wrap gap-x-3.5 gap-y-1.5 whitespace-nowrap px-[var(--db-gutter)] pt-2 pb-2.5 text-[10.5px] text-theme-dim";

const FIRST_ROW_SELECTOR = '[data-cell="1:0"], [data-note-id][tabindex="0"]';

function summaryText(status: DatabaseScopeStatus, shown: number, total: number): string {
  if (status !== "ready") return "Not available";
  if (shown === total) return `${total} ${total === 1 ? "note" : "notes"}`;
  return `${shown} of ${total} notes`;
}

/**
 * A folder's notes, or every note, as a table or board over their
 * properties. Reads come from the store through narrow selectors and every
 * edit is an ordinary note or property operation, so the view adds nothing to
 * navigation or startup.
 */
export function DatabaseView({ store, folderId, windowControls, sidebarToggle }: Props) {
  const model = useDatabase(store, folderId);
  const mainRef = useRef<HTMLElement>(null);
  const openNote = useCallback(
    (noteId: string) => activateReference(store, "note", noteId),
    [store],
  );
  const rename = useCallback(
    (noteId: string, title: string) => renameNode(store, noteId, title),
    [store],
  );
  const total = model.rows.length;
  const shown = model.arranged.rows.length;
  const inactive = model.arranged.inactiveFilters.length;
  const ready = model.status === "ready";
  const searching = model.search.trim() !== "";
  const filtering = model.view.filters.length > 0;

  function newNote(): void {
    const noteId = model.createNote("");
    if (noteId !== null) openNote(noteId);
  }

  function focusFirstRow(): void {
    mainRef.current?.querySelector<HTMLElement>(FIRST_ROW_SELECTOR)?.focus();
  }

  function unmatchedActions(): EmptyStateAction[] {
    const actions: EmptyStateAction[] = [];
    if (searching) {
      actions.push({
        id: "clear-search",
        label: "Clear search",
        variant: "secondary",
        onClick: () => model.setSearch(""),
      });
    }
    if (filtering) {
      actions.push({
        id: "clear-filters",
        label: "Clear filters",
        variant: "secondary",
        onClick: () => model.updateView({ filters: [] }),
      });
    }
    return actions;
  }

  return (
    <main
      ref={mainRef}
      className="database-page relative col-[3/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-theme-editor"
      aria-labelledby="database-title"
    >
      {windowControls}
      <div className="absolute left-2 top-1.5 flex">{sidebarToggle}</div>
      <header className="px-[var(--db-gutter)] pb-2.5">
        <div className="flex h-11 min-w-0 items-center gap-3 pl-[max(0px,calc(44px-var(--db-gutter)))]">
          <h1
            id="database-title"
            className="m-0 min-w-0 truncate text-[15px] font-medium tracking-[-0.01em] text-foreground"
          >
            {model.title}
          </h1>
          <p className="m-0 shrink-0 text-[12.5px] tabular-nums text-theme-secondary">
            {summaryText(model.status, shown, total)}
          </p>
        </div>
        {ready && (
          <div className="mt-1.5">
            <DatabaseToolbar
              model={model}
              folderScoped={folderId !== null}
              onNewNote={newNote}
              onLeaveSearch={focusFirstRow}
            />
          </div>
        )}
        {model.problem && (
          <p role="status" className="mt-2.5 mb-0 text-xs leading-[1.45] text-theme-secondary">
            {model.problem}
          </p>
        )}
        {inactive > 0 && (
          <p role="status" className="mt-2.5 mb-0 text-xs leading-[1.45] text-theme-secondary">
            {inactive === 1
              ? "One filter names a property no notes here have, so it is ignored."
              : `${inactive} filters name properties no notes here have, so they are ignored.`}
          </p>
        )}
        {model.notice && (
          <div
            role="alert"
            className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 py-1.5 pr-2 pl-3 text-[12.5px] text-destructive"
          >
            <span className="min-w-0 flex-1">{model.notice}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="inline-flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-md text-current opacity-80 outline-none transition-[background-color,opacity] duration-150 hover:bg-destructive/15 hover:opacity-100 focus-visible:bg-destructive/15 focus-visible:opacity-100"
              onClick={() => model.setNotice(null)}
            >
              <CloseIcon size={11} />
            </button>
          </div>
        )}
      </header>

      {model.status !== "ready" ? (
        <div className="w-[min(480px,calc(100%-40px))] place-self-center">
          <EmptyState
            colors={EMPTY_STATE_COLORS}
            illustration={<IconStack icon={<DatabaseIcon />} />}
            title="Nothing to show"
            description={UNAVAILABLE[model.status]}
          />
        </div>
      ) : total === 0 ? (
        <div className="w-[min(480px,calc(100%-40px))] place-self-center pb-16">
          <EmptyState
            colors={EMPTY_STATE_COLORS}
            illustration={<IconStack icon={<DatabaseIcon />} />}
            title="No notes here yet"
            description={
              folderId === null
                ? "Every note in the workspace shows up here with its properties."
                : "Notes in this folder show up here with their properties."
            }
            actions={[{ id: "new-note", label: "New note", onClick: newNote }]}
          />
        </div>
      ) : shown === 0 ? (
        <div className="w-[min(480px,calc(100%-40px))] place-self-center pb-16">
          <EmptyState
            colors={EMPTY_STATE_COLORS}
            style={COMPACT_EMPTY_STATE_STYLE}
            illustration={<SearchIllustration />}
            title={searching ? `No notes match “${model.search.trim()}”` : "No notes match"}
            description={
              filtering
                ? `${total} ${total === 1 ? "note is" : "notes are"} hidden by the filters on this view.`
                : "Names are searched as you type."
            }
            actions={unmatchedActions()}
          />
        </div>
      ) : model.view.layout === "board" ? (
        <DatabaseBoard model={model} onOpenNote={openNote} />
      ) : (
        <DatabaseTable model={model} onOpenNote={openNote} onRename={rename} />
      )}

      {ready && shown > 0 && (
        <p id="database-keyboard-help" className={keyHintClass}>
          {model.view.layout === "board" ? (
            <>
              <span>
                <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> Move
              </span>
              <span>
                <kbd>Enter</kbd> Open note
              </span>
              <span>
                <kbd>Alt</kbd> <kbd>←</kbd> <kbd>→</kbd> Move card to the next group
              </span>
            </>
          ) : (
            <>
              <span>
                <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> Move
              </span>
              <span>
                <kbd>Enter</kbd> Open note or edit
              </span>
              <span>
                <kbd>Ctrl</kbd> <kbd>Enter</kbd> Open note from any cell
              </span>
              <span>
                <kbd>F2</kbd> Rename or edit
              </span>
              <span>
                <kbd>Space</kbd> Toggle
              </span>
              <span>
                <kbd>1</kbd> to <kbd>5</kbd> Rate
              </span>
              <span>
                <kbd>Delete</kbd> Clear
              </span>
            </>
          )}
        </p>
      )}
    </main>
  );
}
