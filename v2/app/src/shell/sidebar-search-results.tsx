import { useMemo } from "react";
import { useRendererSelector } from "../store/use-renderer-selector";
import { FileTextIcon, FolderIcon } from "../shared/icons";
import type { RendererState, RendererStore } from "../store/types";
import { searchSidebarNodes } from "./sidebar-search";

const MAX_SEARCH_RESULTS_PER_TYPE = 10;

function selectNodes(state: RendererState) {
  return state.nodes;
}

function selectNodeOrder(state: RendererState) {
  return state.nodeOrder;
}

function selectActiveNoteId(state: RendererState) {
  return state.activeNoteId;
}

type SearchResultsProps = {
  ref: React.Ref<HTMLDivElement>;
  store: RendererStore;
  query: string;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
  onFolderSelect: (id: string) => void;
  onNoteSelect: (id: string) => void;
};

export function SidebarSearchResults({
  ref,
  store,
  query,
  onKeyDown,
  onBlur,
  onFolderSelect,
  onNoteSelect,
}: SearchResultsProps) {
  const nodes = useRendererSelector(store, selectNodes);
  const nodeOrder = useRendererSelector(store, selectNodeOrder);
  const activeNoteId = useRendererSelector(store, selectActiveNoteId);
  const results = useMemo(
    () => searchSidebarNodes(nodes, nodeOrder, query, MAX_SEARCH_RESULTS_PER_TYPE),
    [nodes, nodeOrder, query],
  );
  const hasResults = results.folderTotal > 0 || results.noteTotal > 0;
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      role="region"
      aria-label="Sidebar search results"
    >
      {hasResults ? (
        <div className="flex flex-col gap-3">
          {results.folders.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Folders
              </p>
              {results.folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFolderSelect(folder.id)}
                  className="flex h-[34px] w-full items-center gap-1.5 border border-transparent px-2 text-left text-xs font-medium text-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground/88"
                >
                  <FolderIcon
                    size={14}
                    className="shrink-0 text-muted-foreground/70"
                  />
                  <span className="truncate">{folder.title}</span>
                </button>
              ))}
              {results.folderTotal > results.folders.length && (
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                  +{results.folderTotal - results.folders.length} more folders
                </p>
              )}
            </div>
          )}
          {results.notes.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              {results.notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNoteSelect(note.id)}
                  aria-current={note.id === activeNoteId ? "page" : undefined}
                  className={`flex h-[34px] w-full items-center gap-1.5 border border-transparent px-2 text-left text-xs font-medium transition-colors ${
                    note.id === activeNoteId
                      ? "border-border bg-muted text-foreground"
                      : "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88"
                  }`}
                >
                  <FileTextIcon
                    size={14}
                    className="shrink-0 text-muted-foreground/70"
                  />
                  <span className="truncate">{note.title}</span>
                </button>
              ))}
              {results.noteTotal > results.notes.length && (
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                  +{results.noteTotal - results.notes.length} more notes
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-2 py-6 text-center" role="status">
          <p className="text-xs font-medium text-foreground/70">No matching titles</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Try a different note or folder name.
          </p>
        </div>
      )}
    </div>
  );
}
