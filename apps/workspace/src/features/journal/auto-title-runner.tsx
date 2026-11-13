import { useEffect } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import {
  runTitleCompletion,
  sameAiModel,
  titleCompletion,
  type AiModelSelection,
  type StartTitleCompletion,
} from "@/features/ai/title-completion";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { showToast } from "@/shared/ui/toast";
import { commitOperations } from "@/store/commit";
import {
  JOURNAL_AUTO_TITLE_ORIGIN,
  journalEntryIsUntitled,
  nextAutoTitleEntry,
  selectJournalAutoTitles,
  titleFromReply,
} from "./auto-title";

const SETTLE_DELAY_MS = 2_000;

type Options = {
  startCompletion?: StartTitleCompletion;
  today?: () => DateKey;
  reportFailure?: (message: string) => void;
  settleDelayMs?: number;
};

function toastFailure(message: string): void {
  showToast({
    message: "Journal titles paused",
    description: `${message} Titles resume when you choose another AI model or switch the setting off and on.`,
  });
}

/**
 * @name startJournalAutoTitles
 * @description Titles untitled journal entries in the background while the
 * setting is on: one request at a time, newest entry first, through the
 * default model and the library's title prompt. A failed request pauses the
 * work and says so, until the model or the setting changes. Returns the
 * function that stops it.
 *
 * @example
 * useEffect(() => startJournalAutoTitles(store, signal), [store, signal]);
 */
export function startJournalAutoTitles(
  store: RendererStore,
  signal: AbortSignal,
  options: Options = {},
): () => void {
  const today = options.today ?? todayKey;
  const reportFailure = options.reportFailure ?? toastFailure;
  const settleDelayMs = options.settleDelayMs ?? SETTLE_DELAY_MS;
  const attempted = new Set<string>();
  let running = false;
  let stopped = false;
  let pausedOn: AiModelSelection | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function live(): boolean {
    return !stopped && !signal.aborted;
  }

  function schedule(): void {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(pump, settleDelayMs);
  }

  function pump(): void {
    timer = null;
    if (!live() || running) {
      return;
    }
    const state = store.getState();
    if (!selectJournalAutoTitles(state)) {
      pausedOn = null;
      return;
    }
    const entry = nextAutoTitleEntry(state, today(), attempted);
    const completion = entry === null ? null : titleCompletion(state, entry.markdown);
    if (entry === null || completion === null) {
      return;
    }
    const model = completion.model;
    if (pausedOn !== null && sameAiModel(pausedOn, model)) {
      return;
    }
    pausedOn = null;
    attempted.add(entry.noteId);
    running = true;
    void runTitleCompletion(
      completion.request,
      JOURNAL_AUTO_TITLE_ORIGIN,
      signal,
      options.startCompletion,
    ).then((reply) => {
      running = false;
      if (!live()) {
        return;
      }
      if (!reply.ok) {
        attempted.delete(entry.noteId);
        pausedOn = model;
        reportFailure(reply.message);
        return;
      }
      rename(entry.noteId, titleFromReply(reply.text));
      pump();
    });
  }

  function rename(noteId: string, title: string | null): void {
    const state = store.getState();
    if (
      title === null ||
      !selectJournalAutoTitles(state) ||
      !journalEntryIsUntitled(state, noteId)
    ) {
      return;
    }
    void commitOperations(store, [
      { type: "rename_node", id: noteId, title, at: Date.now() },
    ]).catch((error: unknown) => {
      console.error("journal auto title rejected", error);
    });
  }

  const unsubscribeSettings = store.subscribe((state) => state.settings, schedule);
  const unsubscribeMetadata = store.subscribe((state) => state.metadata, schedule);
  schedule();

  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
    }
    unsubscribeSettings();
    unsubscribeMetadata();
  };
}

type Props = {
  store: RendererStore;
  signal: AbortSignal;
};

export function JournalAutoTitles({ store, signal }: Props) {
  useEffect(() => {
    if (isBrowserRuntime()) {
      return;
    }
    return startJournalAutoTitles(store, signal);
  }, [store, signal]);
  return null;
}
