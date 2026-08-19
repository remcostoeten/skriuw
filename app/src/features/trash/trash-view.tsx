import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { emptyTrash, purgeSubtree, restoreSubtree } from "@/store/actions/workspace";
import {
  FileTextIcon,
  FolderIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  Undo2Icon,
} from "@/shared/icons/static";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { Select, type SelectOption } from "@/shared/ui/select";
import { WindowControls } from "@/shell/window-controls";
import {
  filterTrashRows,
  sortTrashRows,
  trashRows,
  trashWindowRange,
} from "@/store/trash";
import type { TrashRow, TrashSortKey } from "@/store/trash";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { cn } from "@/shared/lib/utils";

type Props = {
  store: RendererStore;
};

const columnClass = "mx-auto w-[min(100%,720px)] px-[clamp(20px,4vw,40px)]";

const SORT_OPTIONS: readonly SelectOption<TrashSortKey>[] = [
  { value: "newest", label: "Recently deleted" },
  { value: "oldest", label: "Deleted first" },
  { value: "az", label: "Title A–Z" },
  { value: "za", label: "Title Z–A" },
];

const deletedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function selectSourceNodes(state: RendererState) {
  return state.sourceNodes;
}

function selectDocuments(state: RendererState) {
  return state.documents;
}

export function TrashView({ store }: Props) {
  const sourceNodes = useRendererSelector(store, selectSourceNodes);
  const documents = useRendererSelector(store, selectDocuments);
  const rows = useMemo(() => trashRows(sourceNodes, documents), [documents, sourceNodes]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<TrashSortKey>("newest");
  const [emptyIds, setEmptyIds] = useState<readonly string[] | null>(null);
  const visibleRows = useMemo(
    () => sortTrashRows(filterTrashRows(rows, query), sortKey),
    [query, rows, sortKey],
  );

  function confirmEmpty(): void {
    if (!emptyIds) {
      return;
    }
    emptyTrash(store, emptyIds);
    setEmptyIds(null);
  }

  return (
    <main
      className="relative col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="trash-title"
    >
      <WindowControls className="absolute right-0 top-0" />
      <div className={cn(columnClass, "border-b border-theme-divider pb-4 pt-[26px]")}>
        <div className="flex items-center gap-2">
          <h1
            id="trash-title"
            className="text-base font-[650] tracking-[-0.015em] text-foreground"
          >
            Trash
          </h1>
          {rows.length > 0 && (
            <span className="min-w-[19px] rounded-lg border border-border px-1.5 py-0.5 text-center font-mono text-[10px] leading-[1.3] text-theme-secondary">
              {visibleRows.length === rows.length
                ? rows.length
                : `${visibleRows.length}/${rows.length}`}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-xl text-xs leading-[1.45] text-theme-secondary">
          Deleted notes and folders stay here until you remove them permanently.
        </p>
        {rows.length > 0 && (
          <div className="mt-3.5 flex items-center gap-2">
            <div
              className={cn(
                "flex h-[30px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-theme-dim",
                "focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
              )}
            >
              <SearchIcon size={14} aria-hidden="true" />
              <input
                type="search"
                className="flex-1 bg-transparent text-xs text-foreground outline-none"
                placeholder="Search trash"
                aria-label="Search trash"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select
              label="Sort deleted items"
              prefix="Sort"
              value={sortKey}
              options={SORT_OPTIONS}
              onChange={setSortKey}
            />
            <Button variant="danger" onClick={() => setEmptyIds(rows.map((row) => row.id))}>
              <Trash2Icon size={13} />
              Empty trash
            </Button>
          </div>
        )}
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState searching={query.trim().length > 0} />
      ) : (
        <TrashList
          rows={visibleRows}
          onRestore={(id) => restoreSubtree(store, id)}
          onPurge={(id) => purgeSubtree(store, id)}
        />
      )}

      <Dialog
        open={emptyIds !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEmptyIds(null);
          }
        }}
        title="Empty the trash?"
        className="w-[min(420px,calc(100vw-32px))]"
      >
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <p className="text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
            {`This permanently deletes ${emptyIds?.length ?? 0} ${emptyIds?.length === 1 ? "item" : "items"}.`}
          </p>
          <p className="text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
            This action cannot be undone.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="default" onClick={() => setEmptyIds(null)}>
              Keep them
            </Button>
            <Button variant="dangerFilled" onClick={confirmEmpty}>
              Delete everything
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}

const TRASH_ROW_HEIGHT = 62;
const TRASH_LIST_OVERSCAN = 5;

type TrashListProps = {
  rows: readonly TrashRow[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
};

function TrashList({ rows, onRestore, onPurge }: TrashListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ height: 720, scrollTop: 0 });
  const { start, end } = trashWindowRange(
    rows.length,
    viewport.scrollTop,
    viewport.height,
    TRASH_ROW_HEIGHT,
    TRASH_LIST_OVERSCAN,
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const updateHeight = () => {
      setViewport((current) => ({ ...current, height: element.clientHeight }));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="min-h-0 overflow-y-auto"
      onScroll={(event) =>
        setViewport((current) => ({
          ...current,
          scrollTop: event.currentTarget.scrollTop,
        }))
      }
    >
      <ul
        aria-label="Deleted items"
        className={cn(columnClass, "relative")}
        style={{ height: `${rows.length * TRASH_ROW_HEIGHT}px` }}
      >
        {rows.slice(start, end).map((row, offset) => {
          const index = start + offset;
          return (
            <li
              key={row.id}
              className="absolute inset-x-[clamp(20px,4vw,40px)] top-0 h-[62px]"
              aria-posinset={index + 1}
              aria-setsize={rows.length}
              style={{ transform: `translateY(${index * TRASH_ROW_HEIGHT}px)` }}
            >
              <TrashRowItem
                row={row}
                onRestore={() => onRestore(row.id)}
                onPurge={() => onPurge(row.id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type TrashRowItemProps = {
  row: TrashRow;
  onRestore: () => void;
  onPurge: () => void;
};

function TrashRowItem({ row, onRestore, onPurge }: TrashRowItemProps) {
  const [armed, setArmed] = useState(false);

  return (
    <div
      data-armed={armed}
      className="group grid h-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-theme-divider px-1.5 transition-colors hover:bg-foreground/[0.035] focus-within:bg-foreground/[0.035] data-[armed=true]:bg-foreground/[0.035]"
    >
      <span className="inline-flex justify-center text-muted-foreground" aria-hidden="true">
        {row.kind === "folder" ? <FolderIcon size={15} /> : <FileTextIcon size={15} />}
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="flex min-w-0 items-baseline gap-2">
          <strong className="truncate text-[13px] font-[600] tracking-[-0.01em] text-foreground">
            {row.title}
          </strong>
          {row.location && (
            <span className="shrink-0 truncate text-[10px] text-theme-dim">{row.location}</span>
          )}
        </span>
        <span className="truncate text-[11px] leading-[1.35] text-theme-secondary">
          {row.snippet || (row.kind === "note" ? "Empty note" : row.summary)}
        </span>
      </span>
      <span className="relative flex h-7 w-[210px] shrink-0 items-center justify-end">
        <time
          data-hidden={armed}
          className="whitespace-nowrap font-mono text-[10px] text-theme-dim transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 data-[hidden=true]:opacity-0"
          dateTime={new Date(row.deletedAt).toISOString()}
          title={deletedAtFormatter.format(new Date(row.deletedAt))}
        >
          {formatRelativeTime(row.deletedAt)}
        </time>
        <span
          data-shown={armed}
          className="pointer-events-none absolute right-0 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[shown=true]:pointer-events-auto data-[shown=true]:opacity-100"
        >
          {!armed && (
            <Button
              className="min-h-[26px] px-2 text-[10px]"
              aria-label={`Restore ${row.title}`}
              onClick={onRestore}
            >
              <RotateCcwIcon size={12} />
              Restore
            </Button>
          )}
          <InlineConfirm
            size="sm"
            armed={armed}
            onArmedChange={setArmed}
            confirmLabel="Delete forever"
            cancelLabel="Keep"
            message={row.kind === "folder" ? row.summary : undefined}
            onConfirm={onPurge}
            renderIdle={(arm) => (
              <Button
                variant="danger"
                className="min-h-[26px] px-2 text-[10px]"
                aria-label={`Delete ${row.title} permanently`}
                onClick={arm}
              >
                <Trash2Icon size={12} />
                Delete
              </Button>
            )}
          />
        </span>
      </span>
    </div>
  );
}

type EmptyStateProps = {
  searching: boolean;
};

function EmptyState({ searching }: EmptyStateProps) {
  return (
    <div className={cn(columnClass, "self-start pt-8")}>
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-14 text-center text-theme-secondary">
        <span
          className="flex size-9 items-center justify-center rounded-lg bg-muted text-theme-dim"
          aria-hidden="true"
        >
          {searching ? <SearchIcon size={16} /> : <Trash2Icon size={16} />}
        </span>
        <h2 className="mt-3.5 text-[15px] font-[620] text-foreground">
          {searching ? "No matching items" : "Trash is empty"}
        </h2>
        <p className="mt-1.5 max-w-sm text-xs leading-[1.45]">
          {searching
            ? "Try a different word — deleted items match on title, location, and body."
            : "Notes and folders you delete stay here until you remove them permanently."}
        </p>
        {!searching && (
          <span className="mt-5 inline-flex items-center gap-2 text-[11px] text-theme-dim">
            <Undo2Icon size={13} />
            Restoring an item puts it back in its original folder
          </span>
        )}
      </div>
    </div>
  );
}
