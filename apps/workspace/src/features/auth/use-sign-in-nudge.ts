import { useEffect, useRef } from "react";
import { resolveAppRoute } from "@skriuw/renderer-core/route/app-route";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import {
  deferNudge,
  NUDGE_TIME_INTERVAL_MS,
  readNudgeProgress,
  recordNudgeAction,
  rememberNudgeProgress,
} from "./sign-in-nudge-model";

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
 * Opens the sign-in drawer for a signed-out visitor every few actions
 * (creating a note, opening a note, switching views) and after a fixed stretch
 * of time, whichever comes first. A due nudge waits for a pause in typing so
 * the drawer never takes focus in the middle of a sentence.
 */
export function useSignInNudge(store: RendererStore, enabled: boolean, onNudge: () => void): void {
  const onNudgeRef = useRef(onNudge);
  onNudgeRef.current = onNudge;
  useEffect(() => {
    if (!enabled) return;
    let progress = readNudgeProgress();
    let noteCount = selectNoteCount(store.getState());
    let route = resolveAppRoute(window.location.hash);
    let actionQueued = false;
    let due = false;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    let intervalTimer: ReturnType<typeof setTimeout> | undefined;

    function startInterval(): void {
      clearTimeout(intervalTimer);
      intervalTimer = setTimeout(() => {
        due = true;
        waitForPause();
      }, NUDGE_TIME_INTERVAL_MS);
    }

    function nudge(): void {
      due = false;
      progress = deferNudge(progress);
      rememberNudgeProgress(progress);
      startInterval();
      onNudgeRef.current();
    }

    function waitForPause(): void {
      if (!due) return;
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(nudge, NUDGE_IDLE_MS);
    }

    function countAction(): void {
      // Creating a note also opens it; one store update must count once.
      if (actionQueued) return;
      actionQueued = true;
      queueMicrotask(() => {
        actionQueued = false;
        const step = recordNudgeAction(progress);
        progress = step.progress;
        rememberNudgeProgress(progress);
        due ||= step.due;
        waitForPause();
      });
    }

    function handleHashChange(): void {
      const next = resolveAppRoute(window.location.hash);
      if (next === route) return;
      route = next;
      countAction();
    }

    startInterval();
    const unsubscribeNotes = store.subscribe(selectNoteCount, () => {
      const next = selectNoteCount(store.getState());
      if (next > noteCount) countAction();
      noteCount = next;
    });
    const unsubscribeNavigation = store.subscribe(selectActiveNoteId, () => {
      if (store.getState().activeNoteId !== null) countAction();
    });
    const unsubscribeEdits = store.subscribe(selectActiveMarkdown, waitForPause);
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      unsubscribeNotes();
      unsubscribeNavigation();
      unsubscribeEdits();
      window.removeEventListener("hashchange", handleHashChange);
      clearTimeout(pauseTimer);
      clearTimeout(intervalTimer);
    };
  }, [enabled, store]);
}
