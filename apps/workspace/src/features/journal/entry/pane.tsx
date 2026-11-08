import "./entry.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, TouchEvent } from "react";
import { rendersRawEditor } from "@/features/editor/editor-mode";
import { NoteEditor } from "@/features/editor/note-editor";
import { RawMarkdownEditor } from "@/features/editor/raw-markdown-editor";
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from "@/shared/icons/static";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { toolbarIconButtonClass } from "@/shared/ui/toolbar-button";
import { useShortcutHints } from "@/commands/hints";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import type { SwipeStart } from "@/shared/touch/swipe";
import {
  formatDayHeading,
  formatLongDate,
  type DateKey,
} from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { deleteJournalEntry, ensureJournalEntry } from "../actions";
import { EntriesGroup } from "../history/entries-group";
import { OnThisDaySection } from "../history/on-this-day-section";
import { TotalsGroup } from "../history/totals-group";
import { TrendGroup } from "../history/trend-group";
import { JournalGroup } from "../ledger-group";
import { journalEntryMood, journalNoteIdForDate } from "../model";
import { openJournalDayOffset } from "../navigation";
import { daySwipeStep } from "../navigation/day-swipe";
import { TagsGroup } from "../tags/tags-group";
import { EntryStarter } from "../templates/starter";
import { MoodGroup } from "./mood-group";
import { WordGoalGroup } from "./word-goal-group";

const DAY_STEP_SHORTCUT_IDS = ["journalPreviousDay", "journalNextDay"] as const;

const dayStepButtonClass = cn(toolbarIconButtonClass, "rounded-md focus-visible:outline-none");

export function JournalEntryPane({
  store,
  selectedKey,
}: {
  store: RendererStore;
  selectedKey: DateKey;
}) {
  useEffect(() => {
    ensureJournalEntry(store, selectedKey);
  }, [selectedKey, store]);
  const selectNoteId = useMemo(
    () => (state: RendererState) => journalNoteIdForDate(state, selectedKey),
    [selectedKey],
  );
  const selectRawMode = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      if (noteId === null) {
        return false;
      }
      return rendersRawEditor(state, noteId);
    },
    [selectNoteId],
  );
  const selectMood = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      return noteId === null ? null : journalEntryMood(state, noteId);
    },
    [selectNoteId],
  );
  const selectWordCount = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      return noteId === null ? 0 : (state.metadata.get(noteId)?.wordCount ?? 0);
    },
    [selectNoteId],
  );
  const noteId = useRendererSelector(store, selectNoteId);
  const isRawMode = useRendererSelector(store, selectRawMode);
  const mood = useRendererSelector(store, selectMood);
  const wordCount = useRendererSelector(store, selectWordCount);
  const dayHints = useShortcutHints(store, DAY_STEP_SHORTCUT_IDS);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const swipeRef = useRef<SwipeStart | null>(null);
  useEffect(() => setConfirmingDelete(false), [selectedKey]);
  const returningFocus = useRef(false);
  useEffect(() => {
    if (confirmingDelete) {
      confirmButtonRef.current?.focus();
      return;
    }
    if (returningFocus.current) {
      returningFocus.current = false;
      deleteTriggerRef.current?.focus();
    }
  }, [confirmingDelete]);

  function cancelDelete(): void {
    returningFocus.current = true;
    setConfirmingDelete(false);
  }

  function handleConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    cancelDelete();
  }

  const hasSubstance = wordCount > 0 || mood !== null;

  function handleMarginTouchStart(event: TouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    swipeRef.current =
      touch === undefined || event.touches.length > 1
        ? null
        : { x: touch.clientX, y: touch.clientY, edge: null };
  }

  function handleMarginTouchEnd(event: TouchEvent<HTMLDivElement>): void {
    const start = swipeRef.current;
    const touch = event.changedTouches[0];
    swipeRef.current = null;
    if (start === null || touch === undefined) {
      return;
    }
    const step = daySwipeStep(start, touch.clientX, touch.clientY);
    if (step !== 0) {
      openJournalDayOffset(step);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-theme-editor">
      <div
        data-journal-scroller=""
        className="editor-scroll min-h-0 flex-1 overflow-y-auto px-10 pb-24 max-[899px]:px-4 max-[899px]:pb-16"
      >
        <div className="mx-auto w-full max-w-[900px]">
          <JournalGroup
            id="entry"
            title="Entry"
            heading={formatDayHeading(selectedKey)}
            marginProps={{
              onTouchStart: handleMarginTouchStart,
              onTouchEnd: handleMarginTouchEnd,
              onTouchCancel: () => {
                swipeRef.current = null;
              },
            }}
            margin={
              <>
                <p aria-live="polite" className="mt-1 text-xs leading-[1.45] text-theme-secondary">
                  {formatLongDate(selectedKey)}
                </p>
                <p role="status" className="mt-2.5 text-[11.5px] tabular-nums text-theme-dim">
                  {wordCount} {wordCount === 1 ? "word" : "words"}
                  {wordCount > 0 ? ", auto-saved" : ""}
                </p>
                <div className="-ml-1.5 mt-2.5 flex items-center gap-0.5">
                  <Tooltip
                    label="Previous day"
                    side="bottom"
                    shortcut={dayHints.journalPreviousDay}
                  >
                    <button
                      type="button"
                      onClick={() => openJournalDayOffset(-1)}
                      aria-label="Previous day"
                      className={dayStepButtonClass}
                    >
                      <ChevronLeftIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip label="Next day" side="bottom" shortcut={dayHints.journalNextDay}>
                    <button
                      type="button"
                      onClick={() => openJournalDayOffset(1)}
                      aria-label="Next day"
                      className={dayStepButtonClass}
                    >
                      <ChevronRightIcon size={16} />
                    </button>
                  </Tooltip>
                </div>
              </>
            }
          >
            <div className="journal-entry-body relative min-h-[320px] max-w-[72ch] pb-4 max-[899px]:min-h-[180px]">
              {noteId !== null &&
                (isRawMode ? (
                  <RawMarkdownEditor store={store} selectNoteId={selectNoteId} />
                ) : (
                  <NoteEditor store={store} selectNoteId={selectNoteId} />
                ))}
              {noteId !== null && wordCount === 0 && (
                <EntryStarter store={store} noteId={noteId} dateKey={selectedKey} />
              )}
            </div>
            {noteId !== null && hasSubstance && (
              <div className="flex max-w-[72ch] items-center justify-end border-t border-theme-divider/85 pt-2.5">
                {confirmingDelete ? (
                  <div
                    role="group"
                    aria-label="Confirm deleting this entry"
                    onKeyDown={handleConfirmKeyDown}
                    className="flex items-center gap-2"
                  >
                    <span className="text-[11.5px] text-destructive">Delete this entry?</span>
                    <button
                      type="button"
                      ref={confirmButtonRef}
                      onClick={() => {
                        deleteJournalEntry(store, noteId);
                        setConfirmingDelete(false);
                      }}
                      aria-label={`Delete the entry for ${formatLongDate(selectedKey)}`}
                      className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11.5px] font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={cancelDelete}
                      className="rounded-md border border-transparent px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    ref={deleteTriggerRef}
                    onClick={() => setConfirmingDelete(true)}
                    aria-label="Delete this entry"
                    className="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[11.5px] text-theme-dim transition-colors hover:bg-theme-hover hover:text-destructive focus-visible:outline-none"
                  >
                    <Trash2Icon size={12} aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </JournalGroup>
          <MoodGroup store={store} dateKey={selectedKey} />
          <WordGoalGroup
            store={store}
            noteId={noteId}
            dateKey={selectedKey}
            wordCount={wordCount}
          />
          <OnThisDaySection store={store} dateKey={selectedKey} />
          <TagsGroup store={store} dateKey={selectedKey} />
          <TotalsGroup store={store} />
          <TrendGroup store={store} />
          <EntriesGroup store={store} />
        </div>
      </div>
    </div>
  );
}
