import { useEffect, useRef } from "react";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { readNudgeProgress, recordNudgeAction, rememberNudgeProgress } from "./sign-in-nudge-model";

const NUDGE_IDLE_MS = 2_000;

function selectNoteCount(state: RendererState): number {
  return state.noteIds.length;
}

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

function selectActiveMarkdown(state: RendererState): string | undefined {
  return state.activeNoteId === null
    ? undefined
    : state.documents.get(state.activeNoteId)?.markdown;
}

/**
 * Opens the sign-in drawer once a signed-out visitor has created or edited
 * enough notes. A due nudge waits for a pause in typing so the drawer never
 * takes focus in the middle of a sentence.
 */
export function useSignInNudge(store: RendererStore, enabled: boolean, onNudge: () => void): void {
  const onNudgeRef = useRef(onNudge);
  onNudgeRef.current = onNudge;
  useEffect(() => {
    if (!enabled) return;
    let progress = readNudgeProgress();
    let noteCount = selectNoteCount(store.getState());
    let activeNoteId = store.getState().activeNoteId;
    let activeMarkdown = selectActiveMarkdown(store.getState());
    let lastEditedNoteId: string | null = null;
    let due = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function waitForPause(): void {
      if (!due) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        due = false;
        onNudgeRef.current();
      }, NUDGE_IDLE_MS);
    }

    function countAction(): void {
      const step = recordNudgeAction(progress);
      progress = step.progress;
      rememberNudgeProgress(progress);
      due ||= step.due;
      waitForPause();
    }

    const unsubscribeNotes = store.subscribe(selectNoteCount, () => {
      const next = selectNoteCount(store.getState());
      if (next > noteCount) countAction();
      noteCount = next;
    });
    const unsubscribeNavigation = store.subscribe(selectActiveNoteId, () => {
      const state = store.getState();
      activeNoteId = state.activeNoteId;
      activeMarkdown = selectActiveMarkdown(state);
    });
    const unsubscribeEdits = store.subscribe(selectActiveMarkdown, () => {
      const state = store.getState();
      const markdown = selectActiveMarkdown(state);
      const edited =
        state.activeNoteId !== null &&
        state.activeNoteId === activeNoteId &&
        activeMarkdown !== undefined &&
        markdown !== activeMarkdown;
      activeNoteId = state.activeNoteId;
      activeMarkdown = markdown;
      if (!edited) return;
      if (activeNoteId === lastEditedNoteId) {
        waitForPause();
        return;
      }
      lastEditedNoteId = activeNoteId;
      countAction();
    });
    return () => {
      unsubscribeNotes();
      unsubscribeNavigation();
      unsubscribeEdits();
      clearTimeout(timer);
    };
  }, [enabled, store]);
}
