import { useCallback } from "react";
import type { ReactNode } from "react";
import type { DatabaseScopeStatus } from "@skriuw/renderer-core/database/rows";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { renameNode } from "@/features/notes/operations";
import { activateReference } from "@/features/references/shell";
import { DatabaseIcon } from "@/shared/icons/static";
import { DatabaseBoard } from "./view/board";
import { DatabaseTable } from "./view/table";
import { DatabaseToolbar } from "./view/toolbar";
import { useDatabase } from "./view/use-database";

type Props = {
  store: RendererStore;
  folderId: string | null;
  windowControls: ReactNode;
};

const UNAVAILABLE: Readonly<Record<Exclude<DatabaseScopeStatus, "ready">, string>> = {
  missing: "This folder no longer exists.",
  trashed: "This folder is in the trash. Restore it to open it as a database.",
  journal: "Journal entries are organized by date, so the journal does not open as a database.",
  "not-folder": "Only folders open as a database.",
};

const keyHintClass =
  "flex flex-wrap gap-x-[18px] gap-y-2 px-[clamp(20px,4vw,40px)] py-2.5 text-[11px] text-theme-secondary [&_kbd]:rounded-[4px] [&_kbd]:border [&_kbd]:border-border [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[10px]";

/**
 * A folder's notes, or every note, as a table or board over their
 * properties. Reads come from the store through narrow selectors and every
 * edit is an ordinary note or property operation, so the view adds nothing to
 * navigation or startup.
 */
export function DatabaseView({ store, folderId, windowControls }: Props) {
  const model = useDatabase(store, folderId);
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

  function newNote(): void {
    const noteId = model.createNote("");
    if (noteId !== null) openNote(noteId);
  }

  return (
    <main
      className="relative col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-theme-editor"
      aria-labelledby="database-title"
    >
      {windowControls}
      <header className="px-[clamp(20px,4vw,40px)] pb-3 pt-[38px]">
        <div className="flex min-w-0 items-center gap-2">
          <DatabaseIcon size={18} className="shrink-0 text-theme-dim" />
          <h1
            id="database-title"
            className="min-w-0 truncate text-2xl font-[650] tracking-[-0.035em] text-foreground"
          >
            {model.title}
          </h1>
        </div>
        <p className="mt-1 text-xs leading-[1.45] text-theme-secondary">
          {model.status !== "ready"
            ? "Not available"
            : shown === total
              ? `${total} ${total === 1 ? "note" : "notes"}`
              : `${shown} of ${total} notes`}
        </p>
        {model.status === "ready" && (
          <div className="mt-4">
            <DatabaseToolbar model={model} folderScoped={folderId !== null} onNewNote={newNote} />
          </div>
        )}
        {model.problem && (
          <p role="status" className="mt-3 text-xs text-theme-secondary">
            {model.problem}
          </p>
        )}
        {inactive > 0 && (
          <p role="status" className="mt-3 text-xs text-theme-secondary">
            {inactive === 1
              ? "One filter names a property no notes here have, so it is ignored."
              : `${inactive} filters name properties no notes here have, so they are ignored.`}
          </p>
        )}
        {model.notice && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {model.notice}
          </p>
        )}
      </header>

      {model.status !== "ready" ? (
        <div
          role="status"
          className="w-[min(380px,calc(100%-40px))] place-self-center text-center text-theme-secondary"
        >
          <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
            <DatabaseIcon size={22} />
          </span>
          <h2 className="text-[15px] font-[620] text-foreground">Nothing to show</h2>
          <p className="mt-1.5 text-xs leading-[1.45]">{UNAVAILABLE[model.status]}</p>
        </div>
      ) : model.view.layout === "board" ? (
        <DatabaseBoard model={model} onOpenNote={openNote} />
      ) : (
        <DatabaseTable model={model} onOpenNote={openNote} onRename={rename} />
      )}

      {model.status === "ready" && (
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
