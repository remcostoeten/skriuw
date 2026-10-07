import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { searchWorkspace } from "@/platform/runtime/commands";
import { requestRangeReveal } from "@/features/editor/reveal-controller";
import { openJournalDay } from "@/features/journal/navigation";
import { flushPendingWork } from "@/store/pending-work";
import { SectionChevron, SectionLabel } from "@/shared/ui/section-header";
import { showToast } from "@/shared/ui/toast";
import { activateNote } from "@/features/notes/navigation";
import { commitOperations } from "@/store/commit";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import {
  UNLINKED_MENTION_CANDIDATE_LIMIT,
  noteUnlinkedMentionTerm,
  planLinkMentions,
  planUnlinkMentions,
  projectUnlinkedMentions,
  unlinkedMentionKey,
  type LinkedDocument,
  type UnlinkedMention,
} from "../prosemirror/unlinked-mentions";

const ROWS = 5;
const SEARCH_DELAY_MS = 250;
const NO_MENTIONS: readonly UnlinkedMention[] = [];

type Candidates = {
  key: string;
  noteIds: readonly string[];
};

function sameMentions(left: readonly UnlinkedMention[], right: readonly UnlinkedMention[]) {
  return (
    left.length === right.length &&
    left.every((mention, index) => {
      const other = right[index]!;
      return (
        unlinkedMentionKey(mention) === unlinkedMentionKey(other) &&
        mention.title === other.title &&
        mention.text === other.text &&
        mention.before === other.before &&
        mention.after === other.after
      );
    })
  );
}

function openMention(store: RendererStore, mention: UnlinkedMention): void {
  requestRangeReveal({
    noteId: mention.noteId,
    blockIndex: mention.blockIndex,
    from: mention.from,
    to: mention.to,
    text: mention.text,
  });
  if (mention.dateKey !== null) {
    openJournalDay(mention.dateKey);
    return;
  }
  activateNote(store, mention.noteId);
}

function mentionCountLabel(count: number): string {
  return count === 1 ? "1 mention" : `${count} mentions`;
}

async function undoLink(
  store: RendererStore,
  committed: Promise<void>,
  linked: readonly LinkedDocument[],
): Promise<void> {
  await committed;
  await flushPendingWork();
  const undo = planUnlinkMentions(store.getState(), linked);
  if (undo.operations.length > 0) {
    await commitOperations(store, undo.operations);
  }
  if (undo.skipped.length > 0) {
    showToast({
      message: "Some links were kept",
      description:
        "Notes edited after linking were left as they are. Version history has the earlier text.",
    });
  }
}

async function linkMentions(
  store: RendererStore,
  noteId: string,
  mentions: readonly UnlinkedMention[],
): Promise<void> {
  await flushPendingWork();
  const plan = planLinkMentions(store.getState(), noteId, mentions);
  if (plan.operations.length === 0) {
    showToast({
      message: "Nothing was linked",
      description: "The mention changed after it was found.",
    });
    return;
  }
  const committed = commitOperations(store, plan.operations);
  showToast({
    message: `Linked ${mentionCountLabel(plan.count)}`,
    action: {
      label: "Undo",
      run: () => {
        undoLink(store, committed, plan.linked).catch((error) =>
          console.error("unlinked mention undo rejected", error),
        );
      },
    },
  });
  await committed;
}

function MentionRow({
  mention,
  onOpen,
  onLink,
}: {
  mention: UnlinkedMention;
  onOpen: () => void;
  onLink: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (
      event.key.toLowerCase() === "l" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      onLink();
    }
  }

  return (
    <div className="group/mention flex items-start gap-1 rounded transition-colors hover:bg-muted/50">
      <button
        type="button"
        data-unlinked-mention
        onClick={onOpen}
        onKeyDown={handleKeyDown}
        aria-keyshortcuts="L"
        aria-label={`Open ${mention.title} at “${mention.before}${mention.text}${mention.after}”. Press L to link.`}
        className="min-w-0 flex-1 cursor-pointer rounded px-2 py-1 text-left focus-visible:outline-none"
      >
        <span className="block truncate text-[13px] text-foreground/80">{mention.title}</span>
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {mention.before}
          <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">{mention.text}</mark>
          {mention.after}
        </span>
      </button>
      <button
        type="button"
        onClick={onLink}
        aria-label={`Link mention in ${mention.title}`}
        title="Link (L)"
        className="mt-1 shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/mention:opacity-100 group-focus-within/mention:opacity-100"
      >
        Link
      </button>
    </div>
  );
}

export function UnlinkedMentions({ store, noteId }: { store: RendererStore; noteId: string }) {
  const term = useRendererSelector(
    store,
    useCallback((state: RendererState) => noteUnlinkedMentionTerm(state, noteId), [noteId]),
  );
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const focusIndexRef = useRef<number | null>(null);
  const searchKey = `${noteId}\0${term ?? ""}`;

  useEffect(() => {
    if (term === null) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchWorkspace(term, UNLINKED_MENTION_CANDIDATE_LIMIT)
        .then((hits) => {
          if (!cancelled) {
            setCandidates({ key: searchKey, noteIds: hits.map((hit) => hit.noteId) });
          }
        })
        .catch((error) => {
          console.error("unlinked mention search rejected", error);
          if (!cancelled) {
            setCandidates({ key: searchKey, noteIds: [] });
          }
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchKey, term]);

  const noteIds = candidates?.key === searchKey ? candidates.noteIds : null;
  const mentions = useRendererSelector(
    store,
    useCallback(
      (state: RendererState) =>
        noteIds === null ? NO_MENTIONS : projectUnlinkedMentions(state, noteId, noteIds),
      [noteId, noteIds],
    ),
    sameMentions,
  );

  useEffect(() => {
    const index = focusIndexRef.current;
    if (index === null) {
      return;
    }
    focusIndexRef.current = null;
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-unlinked-mention]");
    if (rows && rows.length > 0) {
      rows[Math.min(index, rows.length - 1)]?.focus();
    }
  }, [mentions]);

  if (term === null) {
    return null;
  }

  function link(targets: readonly UnlinkedMention[], focusIndex: number | null): void {
    focusIndexRef.current = focusIndex;
    linkMentions(store, noteId, targets).catch((error) =>
      console.error("unlinked mention link rejected", error),
    );
  }

  const visible = all ? mentions.length : Math.min(ROWS, mentions.length);
  const loaded = noteIds !== null;

  return (
    <section aria-label="Unlinked mentions">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none"
        >
          <SectionChevron open={open} />
          <SectionLabel title="Unlinked mentions" count={loaded ? mentions.length : undefined} />
        </button>
        {open && mentions.length > 1 && (
          <button
            type="button"
            onClick={() => link(mentions, 0)}
            aria-label={`Link all ${mentions.length} mentions to ${term}`}
            className="h-6 shrink-0 cursor-pointer rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none"
          >
            Link all
          </button>
        )}
      </div>
      {open && loaded && (
        <div className="pb-1.5 pt-0.5">
          {mentions.length === 0 ? (
            <p className="m-0 px-2 py-1 text-[11px] text-muted-foreground/70">
              No unlinked mentions
            </p>
          ) : (
            <ul ref={listRef} className="m-0 list-none space-y-0.5 p-0">
              {mentions.slice(0, visible).map((mention, index) => (
                <li key={unlinkedMentionKey(mention)}>
                  <MentionRow
                    mention={mention}
                    onOpen={() => openMention(store, mention)}
                    onLink={() => link([mention], index)}
                  />
                </li>
              ))}
            </ul>
          )}
          {mentions.length > ROWS && (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((value) => !value)}
              className="mt-1 cursor-pointer px-2 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {all ? "Show less" : `Show all ${mentions.length - ROWS} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
