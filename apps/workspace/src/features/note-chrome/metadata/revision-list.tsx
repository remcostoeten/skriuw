import { useId, useMemo, useState } from "react";
import { cn } from "@/shared/styling/class-names";
import { ChevronDownIcon, CopyIcon, HistoryIcon, RotateCcwIcon } from "@/shared/icons/static";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { showToast } from "@/shared/ui/toast";
import { Collapse } from "@/shared/ui/collapse";
import { readHistoryVersion } from "@/platform/runtime/commands";
import { restoreNoteVersion } from "@/features/history/restore-version";
import {
  formatVersionClock,
  formatVersionTimestamp,
  groupVersionRows,
  type VersionListItem,
  type VersionRow,
} from "@/features/history/versions";
import { formatRelativeTime } from "@/shared/format/relative-time";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { findRevisionSplit, signedWordDelta } from "./inspector-model";
import {
  inspectorIconButton,
  inspectorQuietAction,
  inspectorTransition,
} from "./inspector-classes";

const VISIBLE_REVISIONS = 5;

type Props = {
  store: RendererStore;
  noteId: string;
  versions: readonly VersionListItem[];
  onOpen: (versionId?: string) => void;
};

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

async function copyRevisionMarkdown(noteId: string, versionId: string): Promise<void> {
  try {
    const content = await readHistoryVersion(noteId, versionId);
    await navigator.clipboard.writeText(content.markdown);
    showToast({ message: "Revision copied as Markdown" });
  } catch (error) {
    showToast({
      message: failureMessage(error, "Could not copy this revision."),
    });
  }
}

async function restoreRevision(
  store: RendererStore,
  noteId: string,
  versionId: string,
): Promise<void> {
  const previousMarkdown = store.getState().documents.get(noteId)?.markdown;
  try {
    const content = await readHistoryVersion(noteId, versionId);
    await restoreNoteVersion(store, noteId, content.markdown);
    showToast({
      message: `Restored revision from ${formatVersionTimestamp(content.createdAt)}`,
      action:
        previousMarkdown === undefined
          ? undefined
          : {
              label: "Undo",
              run: () => {
                restoreNoteVersion(store, noteId, previousMarkdown).catch((error: unknown) => {
                  showToast({
                    message: failureMessage(error, "Could not undo the restore."),
                  });
                });
              },
            },
    });
  } catch (error) {
    showToast({ message: failureMessage(error, "Restore failed.") });
  }
}

type RevisionActions = {
  open: (versionId: string) => void;
  copy: (versionId: string) => void;
  restore: (versionId: string) => void;
};

type RowsProps = {
  rows: readonly VersionRow[];
  label: string;
  actions: RevisionActions;
};

function deltaClass(delta: number | null): string {
  if (delta === null || delta === 0) {
    return "text-muted-foreground/50";
  }
  return delta > 0 ? "text-foreground" : "text-muted-foreground";
}

function RevisionRows({ rows, label, actions }: RowsProps) {
  return (
    <ul aria-label={label} className="m-0 list-none p-0">
      {rows.map((row) => {
        if (row.kind === "group") {
          return (
            <li
              key={row.key}
              aria-hidden="true"
              className="px-2 pb-1 pt-2.5 text-[11px] text-muted-foreground/70 first:pt-0"
            >
              {row.label}
            </li>
          );
        }
        const { versionId, createdAt, wordDelta } = row.item;
        return (
          <li key={row.key} data-revision-row="" className="group/revision relative">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => actions.open(versionId)}
                  onKeyDown={(event) => {
                    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                    const key = event.key.toLowerCase();
                    if (key === "r") {
                      event.preventDefault();
                      actions.restore(versionId);
                    } else if (key === "c") {
                      event.preventDefault();
                      actions.copy(versionId);
                    }
                  }}
                  aria-keyshortcuts="C R"
                  title={formatVersionTimestamp(createdAt)}
                  className={cn(
                    "flex h-7 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius)] bg-transparent px-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                    inspectorTransition,
                  )}
                >
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground group-hover/revision:text-foreground group-focus-within/revision:text-foreground">
                    {formatVersionClock(createdAt)}
                  </span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground/60">
                    {formatRelativeTime(createdAt)}
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 font-mono text-[11px] tabular-nums transition-opacity duration-150 group-hover/revision:opacity-0 group-focus-within/revision:opacity-0 pointer-coarse:opacity-100",
                      deltaClass(wordDelta),
                    )}
                    title={
                      wordDelta === null
                        ? undefined
                        : wordDelta === 0
                          ? "No change in length in this revision"
                          : `${Math.abs(wordDelta)} ${Math.abs(wordDelta) === 1 ? "word" : "words"} ${wordDelta > 0 ? "added" : "removed"} in this revision`
                    }
                  >
                    {signedWordDelta(wordDelta)}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem className="gap-2" onSelect={() => actions.open(versionId)}>
                  <HistoryIcon size={14} />
                  Open in history
                </ContextMenuItem>
                <ContextMenuItem className="gap-2" onSelect={() => actions.copy(versionId)}>
                  <CopyIcon size={14} />
                  Copy as Markdown
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="gap-2" onSelect={() => actions.restore(versionId)}>
                  <RotateCcwIcon size={14} />
                  Restore this version
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <span className="pointer-events-none absolute right-0.5 top-0.5 flex gap-px opacity-0 transition-opacity duration-150 group-hover/revision:pointer-events-auto group-hover/revision:opacity-100 group-focus-within/revision:pointer-events-auto group-focus-within/revision:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:static pointer-coarse:opacity-100">
              <button
                type="button"
                data-inspector-skip=""
                aria-label={`Copy revision from ${formatVersionClock(createdAt)} as Markdown`}
                title="Copy as Markdown (C)"
                onClick={() => actions.copy(versionId)}
                className={inspectorIconButton}
              >
                <CopyIcon size={13} />
              </button>
              <button
                type="button"
                data-inspector-skip=""
                aria-label={`Restore revision from ${formatVersionClock(createdAt)}`}
                title="Restore this version (R)"
                onClick={() => actions.restore(versionId)}
                className={inspectorIconButton}
              >
                <RotateCcwIcon size={13} />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function RevisionList({ store, noteId, versions, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [listNoteId, setListNoteId] = useState(noteId);
  if (listNoteId !== noteId) {
    setListNoteId(noteId);
    setExpanded(false);
  }
  const tailId = useId();
  const rows = useMemo(() => groupVersionRows(versions), [versions]);
  const splitIndex = useMemo(() => findRevisionSplit(rows, VISIBLE_REVISIONS), [rows]);

  if (versions.length === 0) {
    return (
      <p className="m-0 px-2 text-[12.5px] leading-relaxed text-muted-foreground/70">
        No revisions yet. The first one is saved after a pause in typing.
      </p>
    );
  }

  const hiddenCount = Math.max(0, versions.length - VISIBLE_REVISIONS);
  const tail = rows.slice(splitIndex);
  const actions: RevisionActions = {
    open: onOpen,
    copy: (versionId) => void copyRevisionMarkdown(noteId, versionId),
    restore: (versionId) => void restoreRevision(store, noteId, versionId),
  };

  return (
    <div>
      <RevisionRows rows={rows.slice(0, splitIndex)} label="Revisions" actions={actions} />
      {tail.length > 0 && (
        <div id={tailId}>
          <Collapse open={expanded}>
            <RevisionRows rows={tail} label="Older revisions" actions={actions} />
          </Collapse>
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={tailId}
          onClick={() => setExpanded((value) => !value)}
          className={cn(inspectorQuietAction, "mt-1")}
        >
          {expanded ? "Show less" : `${hiddenCount} more`}
          <ChevronDownIcon
            size={10}
            className={cn(
              "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </button>
      )}
    </div>
  );
}
