import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { trashWindowRange } from "@skriuw/renderer-core/store/trash";
import type { TrashRow } from "@skriuw/renderer-core/store/trash";
import { formatRelativeTime } from "@/shared/format/relative-time";
import { FileTextIcon, FolderIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import { trashRowPreview, type TrashGroup } from "./model";

export const TRASH_ROW_HEIGHT = 58;
const TRASH_LIST_OVERSCAN = 5;

export type TrashViewport = {
  height: number;
  scrollTop: number;
};

export type TrashRowActions = {
  restore: (id: string) => void;
  purge: (id: string) => void;
};

type Props = {
  group: TrashGroup;
  viewport: TrashViewport;
  tabStopId: string | null;
  actions: TrashRowActions;
};

const deletedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const rowActionClass = cn(
  "inline-flex h-[26px] cursor-pointer items-center rounded-md border-0 bg-transparent px-[9px] text-xs text-theme-secondary outline-none hover:bg-theme-active hover:text-foreground focus-visible:bg-theme-active focus-visible:text-foreground",
  settingsTransition,
  settingsPress,
);

export function trashGroupDomId(groupId: string): string {
  return `trash-group-${groupId}`;
}

export function TrashGroupSection({ group, viewport, tabStopId, actions }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const [listTop, setListTop] = useState(0);
  const count = group.rows.length;
  const range = trashWindowRange(
    count,
    viewport.scrollTop - listTop,
    viewport.height,
    TRASH_ROW_HEIGHT,
    TRASH_LIST_OVERSCAN,
  );
  const start = Math.min(range.start, count);
  const end = Math.max(start, range.end);
  const titleId = `${trashGroupDomId(group.id)}-title`;

  useLayoutEffect(() => {
    const top = listRef.current?.offsetTop ?? 0;
    setListTop((current) => (current === top ? current : top));
  });

  return (
    <section
      id={trashGroupDomId(group.id)}
      aria-labelledby={titleId}
      className="grid grid-cols-[168px_minmax(0,1fr)] gap-x-7 border-t border-theme-divider/85 pt-[22px] pb-2 first:border-t-0 first:pt-3 max-[860px]:grid-cols-1"
    >
      <div className="sticky top-3.5 min-w-0 self-start pt-[7px] max-[860px]:static max-[860px]:pt-0">
        <h2
          id={titleId}
          className="m-0 flex items-baseline gap-[7px] text-[13px] font-medium tracking-[-0.005em] text-foreground"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{group.title}</span>
          <span className="text-[10.5px] font-normal tabular-nums text-theme-dim">{count}</span>
        </h2>
        <p className="mt-1 mb-0 text-xs leading-[1.45] text-theme-secondary">{group.hint}</p>
      </div>
      <ul
        ref={listRef}
        aria-label={`Deleted items, ${group.title}`}
        className="relative m-0 min-w-0 list-none p-0"
        style={{ height: `${count * TRASH_ROW_HEIGHT}px` }}
      >
        {group.rows.slice(start, end).map((row, offset) => {
          const index = start + offset;
          return (
            <li
              key={row.id}
              className="absolute inset-x-0 top-0"
              aria-posinset={index + 1}
              aria-setsize={count}
              style={{
                height: `${TRASH_ROW_HEIGHT}px`,
                transform: `translateY(${index * TRASH_ROW_HEIGHT}px)`,
              }}
            >
              <TrashRowItem
                row={row}
                last={index === count - 1}
                tabStop={row.id === tabStopId}
                actions={actions}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type TrashRowItemProps = {
  row: TrashRow;
  last: boolean;
  tabStop: boolean;
  actions: TrashRowActions;
};

function TrashRowItem({ row, last, tabStop, actions }: TrashRowItemProps) {
  const [armed, setArmed] = useState(false);
  const deletedAt = new Date(row.deletedAt);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) {
      if (event.key === "Escape" && armed) event.currentTarget.focus();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "r" || event.key === "R" || event.key === "Enter") {
      event.preventDefault();
      actions.restore(row.id);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      setArmed(true);
    }
  }

  return (
    <div
      role="group"
      aria-label={row.title}
      data-trash-row={row.id}
      data-armed={armed}
      tabIndex={tabStop ? 0 : -1}
      className={cn(
        "group relative grid h-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-theme-divider/85 outline-none",
        "before:pointer-events-none before:absolute before:inset-x-[-10px] before:inset-y-0.5 before:rounded-lg before:bg-transparent before:transition-colors before:duration-150 before:ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:before:bg-theme-hover/55 focus-within:before:bg-theme-hover/55 focus-visible:before:bg-theme-hover data-[armed=true]:before:bg-theme-hover/55",
        "[&>*]:relative",
        last && "border-b-transparent",
      )}
      onKeyDown={onKeyDown}
    >
      <span className="inline-flex justify-center text-theme-dim" aria-hidden="true">
        {row.kind === "folder" ? <FolderIcon size={15} /> : <FileTextIcon size={15} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[13px] tracking-[-0.005em] text-foreground">
            {row.title}
          </span>
          {row.location && (
            <span className="shrink-0 truncate text-[11.5px] text-theme-dim">
              in {row.location}
            </span>
          )}
        </span>
        <span className="truncate text-xs leading-[1.45] text-theme-secondary">
          {trashRowPreview(row)}
        </span>
      </span>
      <span className="grid shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
        <time
          data-hidden={armed}
          className="whitespace-nowrap text-[11.5px] tabular-nums text-theme-dim transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 data-[hidden=true]:opacity-0 pointer-coarse:hidden"
          dateTime={deletedAt.toISOString()}
          title={deletedAtFormatter.format(deletedAt)}
        >
          {formatRelativeTime(row.deletedAt)}
        </time>
        <span
          data-shown={armed}
          className="pointer-events-none -mr-[9px] flex items-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[shown=true]:pointer-events-auto data-[shown=true]:mr-0 data-[shown=true]:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
        >
          {!armed && (
            <button
              type="button"
              className={rowActionClass}
              aria-label={`Restore ${row.title}`}
              onClick={() => actions.restore(row.id)}
            >
              Restore
            </button>
          )}
          <InlineConfirm
            size="sm"
            armed={armed}
            onArmedChange={setArmed}
            confirmLabel="Delete forever"
            cancelLabel="Keep"
            message={row.kind === "folder" ? row.summary : undefined}
            onConfirm={() => actions.purge(row.id)}
            renderIdle={(arm) => (
              <button
                type="button"
                className={cn(
                  rowActionClass,
                  "hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive",
                )}
                aria-label={`Delete ${row.title} permanently`}
                onClick={arm}
              >
                Delete
              </button>
            )}
          />
        </span>
      </span>
    </div>
  );
}
