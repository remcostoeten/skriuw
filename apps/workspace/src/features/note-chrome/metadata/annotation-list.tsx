import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { requestThreadReveal } from "@/features/editor/reveal-controller";
import { setAnnotationResolved } from "@/features/editor/annotation-threads";
import { CheckIcon, RotateCcwIcon } from "@/shared/icons/static";
import { formatRelativeTime } from "@/shared/format/relative-time";
import { cn } from "@/shared/styling/class-names";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { anchoredThreadIds, threadsForNote } from "./annotation-model";
import { inspectorIconButton, inspectorRowClass, inspectorTransition } from "./inspector-classes";

type Filter = "open" | "resolved" | "all";

const FILTERS: readonly Filter[] = ["open", "resolved", "all"];

type Props = {
  store: RendererStore;
  noteId: string;
};

function selectAnnotations(state: RendererState) {
  return state.annotations;
}

const filterLabels: Record<Filter, string> = {
  open: "Open",
  resolved: "Resolved",
  all: "All",
};

export function AnnotationList({ store, noteId }: Props) {
  const annotations = useRendererSelector(store, selectAnnotations);
  const markdown = useRendererSelector(
    store,
    useCallback((state: RendererState) => state.documents.get(noteId)?.markdown ?? "", [noteId]),
  );
  const [filter, setFilter] = useState<Filter>("open");
  const [filterNoteId, setFilterNoteId] = useState(noteId);
  if (filterNoteId !== noteId) {
    setFilterNoteId(noteId);
    setFilter("open");
  }
  const listRef = useRef<HTMLDivElement>(null);
  const focusAfterRef = useRef<string | null>(null);

  const threads = useMemo(() => threadsForNote(annotations, noteId), [annotations, noteId]);
  const anchored = useMemo(() => anchoredThreadIds(markdown), [markdown]);
  const visible = threads.filter((thread) => filter === "all" || thread.status === filter);
  const openCount = threads.filter((thread) => thread.status === "open").length;
  const counts: Record<Filter, number> = {
    open: openCount,
    resolved: threads.length - openCount,
    all: threads.length,
  };

  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) {
      return;
    }
    focusAfterRef.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-thread-id="${target}"]`);
    (row ?? listRef.current?.querySelector<HTMLElement>(`[data-filter="${filter}"]`))?.focus();
  }, [annotations, filter]);

  if (threads.length === 0) {
    return (
      <p className="m-0 px-2 text-[12.5px] text-muted-foreground">No comments in this note.</p>
    );
  }

  function moveFilter(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === "ArrowRight" ? 1 : FILTERS.length - 1;
    const next = FILTERS[(FILTERS.indexOf(filter) + step) % FILTERS.length]!;
    setFilter(next);
    requestAnimationFrame(() => {
      event.currentTarget.querySelector<HTMLElement>(`[data-filter="${next}"]`)?.focus();
    });
  }

  function toggleResolved(threadId: string, resolved: boolean): void {
    const index = visible.findIndex((thread) => thread.id === threadId);
    const neighbour = visible[index + 1] ?? visible[index - 1];
    if (filter !== "all") {
      focusAfterRef.current = neighbour?.id ?? "";
    }
    setAnnotationResolved(store, threadId, resolved, Date.now());
  }

  return (
    <div ref={listRef} className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label="Filter comments"
        onKeyDown={moveFilter}
        className="flex gap-0.5 rounded-lg bg-muted/40 p-0.5"
      >
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={filter === option}
            data-filter={option}
            tabIndex={filter === option ? 0 : -1}
            onClick={() => setFilter(option)}
            className={cn(
              "flex h-6 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-transparent text-[12px] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97] motion-reduce:active:scale-100",
              inspectorTransition,
              filter === option ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {filterLabels[option]}
            <span className="tabular-nums text-muted-foreground/60">{counts[option]}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="m-0 px-2 text-[12.5px] text-muted-foreground">
          {filter === "open" ? "Every thread here is resolved." : "No resolved threads yet."}
        </p>
      ) : (
        <ul aria-label="Comment threads" className="m-0 flex list-none flex-col gap-0.5 p-0">
          {visible.map((thread) => {
            const orphaned = !anchored.has(thread.id);
            const first = thread.comments[0];
            const resolved = thread.status === "resolved";
            return (
              <li key={thread.id} className="group/thread relative">
                <button
                  type="button"
                  data-thread-id={thread.id}
                  aria-keyshortcuts="R"
                  onClick={() => requestThreadReveal(noteId, thread.id)}
                  onKeyDown={(event) => {
                    if (
                      event.key.toLowerCase() === "r" &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.altKey &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();
                      toggleResolved(thread.id, !resolved);
                    }
                  }}
                  className={cn(inspectorRowClass, "flex-col items-start gap-0.5 py-1.5 pl-2 pr-9")}
                >
                  <span
                    className={cn(
                      "w-full truncate text-[12.5px] before:text-muted-foreground/60 before:content-['“'] after:text-muted-foreground/60 after:content-['”']",
                      resolved ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {thread.anchorText}
                  </span>
                  {first ? (
                    <span className="line-clamp-2 w-full text-[12.5px] leading-snug text-muted-foreground">
                      {first.bodyMarkdown}
                    </span>
                  ) : null}
                  <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground/70">
                    <span className="tabular-nums">{formatRelativeTime(thread.createdAt)}</span>
                    {thread.comments.length > 1 ? (
                      <span>
                        {thread.comments.length - 1}{" "}
                        {thread.comments.length === 2 ? "reply" : "replies"}
                      </span>
                    ) : null}
                    {orphaned ? <span>original text deleted</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  data-inspector-skip=""
                  aria-label={resolved ? "Reopen thread" : "Resolve thread"}
                  title={resolved ? "Reopen (R)" : "Resolve (R)"}
                  onClick={() => toggleResolved(thread.id, !resolved)}
                  className={cn(
                    inspectorIconButton,
                    "absolute right-1 top-1 size-6 opacity-0 group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                  )}
                >
                  {resolved ? <RotateCcwIcon size={13} /> : <CheckIcon size={13} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
