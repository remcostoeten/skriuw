import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { embeddableFolders, resolveFolderPath } from "@skriuw/renderer-core/database/embed";
import { databaseHash } from "@skriuw/renderer-core/route/app-route";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { activateReference } from "@/features/references/shell";
import { ArrowRightIcon, DatabaseIcon } from "@/shared/icons/static";
import { DatabaseBoard } from "./view/board";
import { panelInputClass, toolButtonClass } from "./view/styles";
import { useDatabase } from "./view/use-database";

type BlockProps = {
  store: RendererStore;
  folder: string;
  editable: boolean;
  onChooseFolder: (path: string) => void;
};

type EmbeddedBoardProps = {
  store: RendererStore;
  folderId: string;
};

const frameClass =
  "my-3 rounded-xl border border-border/70 bg-[hsl(var(--foreground)/0.015)] p-3 font-sans";

function EmbeddedBoard({ store, folderId }: EmbeddedBoardProps) {
  const model = useDatabase(store, folderId, "board");
  const openNote = useCallback(
    (noteId: string) => activateReference(store, "note", noteId),
    [store],
  );
  const total = model.rows.length;
  return (
    <>
      <header className="mb-2.5 flex min-w-0 items-center gap-2 px-1">
        <DatabaseIcon size={15} className="shrink-0 text-theme-dim" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {model.title}
        </span>
        <span className="font-mono text-[11px] text-theme-dim">
          {total} {total === 1 ? "note" : "notes"}
        </span>
        <a href={databaseHash(folderId)} className={`${toolButtonClass} ml-auto no-underline`}>
          Open full view
          <ArrowRightIcon size={12} />
        </a>
      </header>
      {model.notice && (
        <p role="alert" className="mb-2 px-1 text-xs text-destructive">
          {model.notice}
        </p>
      )}
      <DatabaseBoard model={model} onOpenNote={openNote} embedded />
    </>
  );
}

function FolderPicker({ store, folder, editable, onChooseFolder }: BlockProps) {
  const [open, setOpen] = useState(false);
  const folders = open ? embeddableFolders(store.getState()) : [];
  return (
    <div className="flex flex-col items-start gap-2 px-1 py-2 text-xs text-theme-secondary">
      <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <DatabaseIcon size={15} className="text-theme-dim" />
        Database board
      </span>
      <span>
        {folder === ""
          ? "Choose a folder to show its notes as a board."
          : `No folder at "${folder}". Choose another one.`}
      </span>
      {editable && (
        <select
          aria-label="Folder to show"
          className={`${panelInputClass} w-auto max-w-full cursor-pointer`}
          value=""
          onFocus={() => setOpen(true)}
          onPointerDown={() => setOpen(true)}
          onChange={(event) => {
            if (event.target.value !== "") onChooseFolder(event.target.value);
          }}
        >
          <option value="">Choose a folder</option>
          {folders.map((entry) => (
            <option key={entry.id} value={entry.path}>
              {entry.path}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * A folder's notes as a board inside a note. The block stores only the
 * folder's path, and the board reads the same rows and device-local layout as
 * that folder's database route, so the two always agree (ADR-0058).
 */
export function DatabaseBlock(props: BlockProps) {
  const { store, folder } = props;
  const selectFolderId = useCallback(
    (state: RendererState) => resolveFolderPath(state, folder),
    [folder],
  );
  const folderId = useRendererSelector(store, selectFolderId);
  return (
    <div className={frameClass}>
      {folderId === null ? (
        <FolderPicker {...props} />
      ) : (
        <EmbeddedBoard key={folderId} store={store} folderId={folderId} />
      )}
    </div>
  );
}

/**
 * @name createDatabaseNodeView
 * @description Renders a `database_view` block as a live board in its own
 * React root. Events inside the board stay with the board, so typing, arrow
 * keys and card drags never reach the editor.
 * @example
 * nodeViews: { database_view: createDatabaseNodeView(store) }
 */
export function createDatabaseNodeView(store: RendererStore) {
  return function databaseNodeView(
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number | undefined,
  ): NodeView {
    const dom = document.createElement("div");
    dom.className = "skriuw-database-block";
    dom.contentEditable = "false";
    const root = createRoot(dom);
    let current = node;

    function chooseFolder(path: string): void {
      const position = getPos();
      if (position === undefined) return;
      view.dispatch(
        view.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, folder: path }),
      );
    }

    function render(): void {
      root.render(
        <DatabaseBlock
          store={store}
          folder={String(current.attrs.folder)}
          editable={view.editable}
          onChooseFolder={chooseFolder}
        />,
      );
    }

    render();
    return {
      dom,
      update(next) {
        if (next.type !== current.type) return false;
        current = next;
        render();
        return true;
      },
      selectNode() {
        dom.classList.add("ProseMirror-selectednode");
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      stopEvent: (event) => event.target instanceof Node && event.target !== dom,
      ignoreMutation: () => true,
      destroy() {
        // Unmounting synchronously while ProseMirror is mid-render makes React warn.
        queueMicrotask(() => root.unmount());
      },
    };
  };
}
