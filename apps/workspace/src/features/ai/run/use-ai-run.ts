import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AiCompletionRequest } from "@/contracts/ai";
import type { AiActionRun } from "@/features/ai/actions/editor-action-model";
import { aiRunForNote, subscribeAiRuns, type RegisteredAiRun } from "./run-registry";
import { createRunSession, type RunSession } from "./run-session";

type AiRunController = {
  run: AiActionRun;
  /** Starts a run under a fresh id, replacing any run already in flight. */
  fire: (request: AiCompletionRequest) => void;
  /** Re-sends the last request. No-op before a first run. */
  retry: () => void;
  cancel: () => void;
};

type Options = {
  /** Recorded with the run at the provider seam, e.g. `editor:lengthen`. */
  origin: string;
  onStart?: () => void;
};

/** The live run of a session someone else owns, re-rendered as it streams. */
export function useRunSession(session: RunSession): AiActionRun {
  return useSyncExternalStore(session.subscribe, session.getRun, session.getRun);
}

/**
 * Owns one streaming completion for the life of the component. Unmounting
 * disposes the session so no delta or terminal can reach a surface that is
 * gone; a session found disposed when the effect replays (StrictMode tears
 * down and remounts) is replaced rather than left dead.
 */
export function useAiRun(signal: AbortSignal, { origin, onStart }: Options): AiRunController {
  const optionsRef = useRef({ origin, signal, onStart });
  optionsRef.current = { origin, signal, onStart };
  const create = useCallback(
    () =>
      createRunSession({
        origin: optionsRef.current.origin,
        signal: optionsRef.current.signal,
        onStart: () => optionsRef.current.onStart?.(),
      }),
    [],
  );
  const [session, setSession] = useState<RunSession>(create);

  useEffect(() => {
    if (session.isDisposed()) {
      setSession(create());
      return;
    }
    return () => session.dispose();
  }, [create, session]);

  const run = useRunSession(session);
  return { run, fire: session.fire, retry: session.retry, cancel: session.cancel };
}

/** The run registered for a note, or null; re-renders when it is set or ended. */
export function useRegisteredAiRun(noteId: string | null): RegisteredAiRun | null {
  const read = useCallback(() => aiRunForNote(noteId), [noteId]);
  return useSyncExternalStore(subscribeAiRuns, read, read);
}
