import { useMemo, useState } from "react";
import type { WorkspaceAnnotation } from "@/contracts/workspace";
import { requestThreadReveal } from "@/features/editor/reveal-controller";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { cn } from "@/shared/lib/utils";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";

type Filter = "open" | "resolved" | "all";

type Props = {
  store: RendererStore;
  noteId: string;
};

function selectAnnotations(state: RendererState) {
  return state.annotations;
}

function selectActiveNoteMarkdown(state: RendererState): string {
  return state.activeNoteId === null
    ? ""
    : (state.documents.get(state.activeNoteId)?.markdown ?? "");
}

/**
 * A thread is orphaned when its anchor is gone from the note. Detection runs
 * against the saved Markdown rather than the rendered document: the editor
 * shows at most a 192-block window, so a thread anchored outside it would
 * otherwise be reported as orphaned every time.
 */
export function anchoredThreadIds(markdown: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const pattern = /data-skriuw-annotation=["']([A-Za-z0-9_-]+)["']/g;
  let match = pattern.exec(markdown);
  while (match !== null) {
    if (match[1]) ids.add(match[1]);
    match = pattern.exec(markdown);
  }
  return ids;
}

export function threadsForNote(
  annotations: ReadonlyMap<string, WorkspaceAnnotation>,
  noteId: string,
): WorkspaceAnnotation[] {
  return [...annotations.values()]
    .filter((annotation) => annotation.noteId === noteId)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

const filterLabels: Record<Filter, string> = {
  open: "Open",
  resolved: "Resolved",
  all: "All",
};

export function AnnotationList({ store, noteId }: Props) {
  const annotations = useRendererSelector(store, selectAnnotations);
  const markdown = useRendererSelector(store, selectActiveNoteMarkdown);
  const [filter, setFilter] = useState<Filter>("open");

  const threads = useMemo(() => threadsForNote(annotations, noteId), [annotations, noteId]);
  const anchored = useMemo(() => anchoredThreadIds(markdown), [markdown]);
  const visible = threads.filter(
    (thread) => filter === "all" || thread.status === filter,
  );

  if (threads.length === 0) {
    return <p className="m-0 text-[12px] text-muted-foreground">No comments in this note.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {(["open", "resolved", "all"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            className={cn(
              "cursor-pointer rounded-md bg-transparent px-2 py-0.5 text-[12px] transition-colors",
              filter === option
                ? "bg-muted/60 text-foreground"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
            onClick={() => setFilter(option)}
          >
            {filterLabels[option]}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="m-0 text-[12px] text-muted-foreground">
          {filter === "open" ? "Every thread here is resolved." : "No resolved threads yet."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {visible.map((thread) => {
            const orphaned = !anchored.has(thread.id);
            const first = thread.comments[0];
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md bg-transparent px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => requestThreadReveal(noteId, thread.id)}
                >
                  <span className="flex w-full items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/80">
                      {thread.anchorText}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                      {formatRelativeTime(thread.createdAt)}
                    </span>
                  </span>
                  {first ? (
                    <span className="w-full truncate text-[12px] text-muted-foreground">
                      {first.bodyMarkdown}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                    {thread.comments.length > 1 ? (
                      <span>{thread.comments.length - 1} replies</span>
                    ) : null}
                    {orphaned ? (
                      <span className="text-muted-foreground">original text deleted</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
