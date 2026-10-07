import "./entry.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, TouchEvent } from "react";
import { editorModeForNote } from "@/features/editor/editor-mode";
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
  todayKey,
  type DateKey,
} from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { deleteJournalEntry, ensureJournalEntry, setJournalMood } from "../actions";
import { OnThisDaySection } from "../history/on-this-day-section";
import { journalEntryMood, journalNoteIdForDate, type MoodLevel } from "../model";
import { openJournalDayOffset } from "../navigation";
import { daySwipeStep } from "../navigation/day-swipe";
import { EntryStarter } from "../templates/starter";
import { MoodSelector } from "./mood-selector";
import { WordGoalControl } from "./word-goal-control";

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
      return (
        editorModeForNote(state, noteId) === "raw" ||
        state.documents.get(noteId)?.hasLosslessMarkdown === true
      );
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

  function toggleMood(level: MoodLevel): void {
    if (noteId === null) {
      return;
    }
    setJournalMood(store, noteId, mood === level ? null : level);
  }

  const hasSubstance = wordCount > 0 || mood !== null;

  function handleHeaderTouchStart(event: TouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    swipeRef.current =
      touch === undefined || event.touches.length > 1
        ? null
        : { x: touch.clientX, y: touch.clientY, edge: null };
  }

  function handleHeaderTouchEnd(event: TouchEvent<HTMLDivElement>): void {
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
        className="shrink-0 px-12 pt-8 max-[899px]:px-5 max-[899px]:pt-4"
        onTouchStart={handleHeaderTouchStart}
        onTouchEnd={handleHeaderTouchEnd}
        onTouchCancel={() => {
          swipeRef.current = null;
        }}
      >
        <header className="mx-auto w-full max-w-[72ch] border-b border-border/55 pb-5 max-[899px]:pb-3">
          <div className="flex items-start justify-between gap-3">
            <div aria-live="polite" className="min-w-0">
              <h1 className="text-[34px] font-semibold leading-none tracking-tight text-foreground max-[899px]:text-[26px]">
                {formatDayHeading(selectedKey)}
              </h1>
              <p className="mt-2 text-[14px] text-muted-foreground/62 max-[899px]:mt-1.5 max-[899px]:text-[13px]">
                {formatLongDate(selectedKey)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <WordGoalControl
                store={store}
                noteId={noteId}
                dateKey={selectedKey}
                today={todayKey()}
                wordCount={wordCount}
              />
              <Tooltip label="Previous day" side="bottom" shortcut={dayHints.journalPreviousDay}>
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
          </div>
          <MoodSelector mood={mood} onSelect={toggleMood} />
        </header>
      </div>
      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto px-12 max-[899px]:px-5">
        <div className="mx-auto w-full max-w-[72ch]">
          <div className="journal-entry-body relative min-h-[320px] py-6 max-[899px]:min-h-[180px] max-[899px]:py-4">
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
          <OnThisDaySection store={store} dateKey={selectedKey} />
        </div>
      </div>
      <div className="shrink-0 px-12 pb-8 max-[899px]:px-5 max-[899px]:pb-3">
        <div className="mx-auto flex w-full max-w-[72ch] flex-wrap items-center justify-between gap-3 border-t border-border/55 pt-4">
          <div role="status" className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground/40">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
            {wordCount > 0 && (
              <span className="text-[11px] text-muted-foreground/30">auto-saved</span>
            )}
          </div>
          {noteId !== null && hasSubstance && (
            <div>
              {confirmingDelete ? (
                <div
                  role="group"
                  aria-label="Confirm deleting this entry"
                  onKeyDown={handleConfirmKeyDown}
                  className="flex items-center gap-2"
                >
                  <span className="text-[11px] text-destructive/70">Delete this entry?</span>
                  <button
                    type="button"
                    ref={confirmButtonRef}
                    onClick={() => {
                      deleteJournalEntry(store, noteId);
                      setConfirmingDelete(false);
                    }}
                    aria-label={`Delete the entry for ${formatLongDate(selectedKey)}`}
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none"
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
                  className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground/40 transition-colors hover:border-border hover:bg-muted hover:text-destructive focus-visible:outline-none"
                >
                  <Trash2Icon size={12} aria-hidden="true" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
