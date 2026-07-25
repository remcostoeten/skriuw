import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { emptyTrash, purgeSubtree, restoreSubtree } from "../actions/workspace";
import {
  FileTextIcon,
  FolderIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "../shared/icons";
import { formatRelativeTime } from "../shared/lib/relative-time";
import { Button } from "../shared/ui/button";
import { Dialog } from "../shared/ui/dialog";
import { filterTrashRows, trashRows, trashWindowRange } from "../store/trash";
import type { TrashRow } from "../store/trash";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import { cn } from "../shared/lib/utils";

type Props = {
  store: RendererStore;
};

const columnClass = "mx-auto w-[min(100%,720px)] px-[clamp(20px,4vw,40px)]";

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
  const [emptyIds, setEmptyIds] = useState<readonly string[] | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null);
  const visibleRows = useMemo(() => filterTrashRows(rows, query), [query, rows]);

  function confirmEmpty(): void {
    if (!emptyIds) {
      return;
    }
    emptyTrash(store, emptyIds);
    setEmptyIds(null);
  }

  function confirmPurge(): void {
    if (!purgeTarget) {
      return;
    }
    purgeSubtree(store, purgeTarget.id);
    setPurgeTarget(null);
  }

  return (
    <main
      className="col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="trash-title"
    >
      <div
        className={cn(
          columnClass,
          "pb-3.5 pt-[26px] pr-[calc(var(--window-controls-width,112px)+8px)]",
        )}
      >
        <span className="flex items-center gap-1.5 text-[11px] text-theme-dim">
          <Trash2Icon size={12} />
          Trash
        </span>
        <div className="mt-2.5 flex items-start justify-between gap-6">
          <h1
            id="trash-title"
            className="text-[26px] font-[650] leading-[1.15] tracking-[-0.03em] text-foreground"
          >
            Trash
          </h1>
          <Button
            variant="danger"
            disabled={rows.length === 0}
            onClick={() => setEmptyIds(rows.map((row) => row.id))}
          >
            <Trash2Icon size={13} />
            Empty trash
          </Button>
        </div>
        <p className="mt-2.5 text-xs leading-[1.45] text-theme-secondary">
          Deleted notes and folders stay here until you remove them permanently.
        </p>
        {rows.length > 0 && (
          <div className="mt-[18px] flex items-center gap-3">
            <div className="flex h-[34px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-theme-dim focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]">
              <SearchIcon size={14} aria-hidden="true" />
              <input
                type="search"
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none"
                placeholder="Search trash"
                aria-label="Search trash"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-theme-dim">
              {visibleRows.length} {visibleRows.length === 1 ? "item" : "items"}
            </span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="w-[min(360px,calc(100%-40px))] place-self-center pb-[10vh] text-center text-theme-secondary">
          <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
            <Trash2Icon size={22} />
          </span>
          <h2 className="text-[15px] font-[620] text-foreground">Trash is empty</h2>
          <p className="mt-1 text-xs leading-[1.45]">
            Notes and folders you delete will stay here until you remove them permanently.
          </p>
          <Button asChild className="mt-[18px]">
            <a href="#/notes">Back to notes</a>
          </Button>
        </div>
      ) : visibleRows.length === 0 ? (
        <p className={cn(columnClass, "pt-8 text-center text-xs text-theme-dim")}>
          No deleted items match “{query.trim()}”.
        </p>
      ) : (
        <TrashList
          rows={visibleRows}
          onRestore={(id) => restoreSubtree(store, id)}
          onPurge={setPurgeTarget}
        />
      )}

      <Dialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeTarget(null);
          }
        }}
        title="Delete permanently?"
        className="w-[min(420px,calc(100vw-32px))]"
      >
        <p className="mb-2 text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
          {purgeTarget?.kind === "folder"
            ? `“${purgeTarget.title}” and everything inside it (${purgeTarget.summary}) will be erased.`
            : `“${purgeTarget?.title ?? ""}” will be erased.`}
        </p>
        <p className="mb-2 text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
          This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="default" onClick={() => setPurgeTarget(null)}>
            Cancel
          </Button>
          <Button variant="dangerFilled" onClick={confirmPurge}>
            Delete permanently
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={emptyIds !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEmptyIds(null);
          }
        }}
        title="Empty trash?"
        className="w-[min(420px,calc(100vw-32px))]"
      >
        <p className="mb-2 text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
          {`This permanently deletes ${emptyIds?.length ?? 0} ${emptyIds?.length === 1 ? "item" : "items"}.`}
        </p>
        <p className="mb-2 text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
          This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="default" onClick={() => setEmptyIds(null)}>
            Cancel
          </Button>
          <Button variant="dangerFilled" onClick={confirmEmpty}>
            Empty trash
          </Button>
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
  onPurge: (row: TrashRow) => void;
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
                onPurge={() => onPurge(row)}
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
  return (
    <div className="group grid h-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-theme-divider px-1.5 transition-colors hover:bg-foreground/[0.035] focus-within:bg-foreground/[0.035]">
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
      <span className="relative flex w-[164px] shrink-0 items-center justify-end">
        <time
          className="whitespace-nowrap font-mono text-[10px] text-theme-dim transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
          dateTime={new Date(row.deletedAt).toISOString()}
          title={deletedAtFormatter.format(new Date(row.deletedAt))}
        >
          {formatRelativeTime(row.deletedAt)}
        </time>
        <span className="absolute right-0 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            className="min-h-[26px] px-2 text-[10px]"
            aria-label={`Restore ${row.title}`}
            onClick={onRestore}
          >
            <RotateCcwIcon size={12} />
            Restore
          </Button>
          <Button
            variant="danger"
            className="min-h-[26px] px-2 text-[10px]"
            aria-label={`Delete ${row.title} permanently`}
            onClick={onPurge}
          >
            <Trash2Icon size={12} />
            Delete
          </Button>
        </span>
      </span>
    </div>
  );
}
