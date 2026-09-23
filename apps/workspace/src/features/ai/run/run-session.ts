import type { AiCompletionEvent, AiCompletionRequest } from "@/contracts/ai";
import { noop } from "@skriuw/shared/helpers/noop";
import {
  startAiCompletion,
  type AiCompletionHandle,
} from "@/features/ai/completion/completion-bridge";
import { createAiCompletionConsumer } from "@/features/ai/completion/completion-consumer";
import {
  IDLE_RUN,
  connectedRun,
  failedRun,
  runWithDelta,
  runWithTerminal,
  startedRun,
  stoppedRun,
  type AiActionRun,
} from "@/features/ai/actions/editor-action-model";
import { startErrorMessage } from "./run-progress";

export type StartCompletion = typeof startAiCompletion;

/**
 * Inspects a finished reply and answers with the request that would fix it, or
 * null when the reply stands. Asked at most once per run the writer started, so
 * a model that keeps failing costs one extra request, not a loop.
 */
export type RunRepair = (
  preview: string,
  request: AiCompletionRequest,
) => Promise<AiCompletionRequest | null>;

/** Schedules one flush and returns a way to withdraw it before it runs. */
export type FlushScheduler = (flush: () => void) => () => void;

export type RunSession = {
  getRun: () => AiActionRun;
  subscribe: (listener: () => void) => () => void;
  /** Starts a run under a fresh id, replacing any run already in flight. */
  fire: (template: AiCompletionRequest) => void;
  /** Re-sends the last request. No-op before a first run or while streaming. */
  retry: () => void;
  cancel: () => void;
  /** Ends the session for good: no delta or terminal reaches state afterwards. */
  dispose: () => void;
  isDisposed: () => boolean;
};

type Options = {
  /** Recorded with the run at the provider seam, e.g. `editor:lengthen`. */
  origin: string;
  signal: AbortSignal;
  onStart?: () => void;
  repair?: RunRepair;
  startCompletion?: StartCompletion;
  scheduleFlush?: FlushScheduler;
  mintRequestId?: () => string;
  now?: () => number;
};

function frameScheduler(flush: () => void): () => void {
  const frame = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(frame);
}

/**
 * Owns one streaming completion outside React. Deltas accumulate here and
 * nowhere else — the canonical document is never a stream target — and are
 * flushed on an animation frame so a fast provider cannot re-render per token.
 *
 * Every fire goes out under its own id. The provider keeps an id reserved
 * until its terminal has been delivered, so a caller that re-sent the same id
 * (a replayed effect, a retry) would be refused as a duplicate while the first
 * send was still in flight.
 */
export function createRunSession(options: Options): RunSession {
  const startCompletion = options.startCompletion ?? startAiCompletion;
  const scheduleFlush = options.scheduleFlush ?? frameScheduler;
  const mintRequestId = options.mintRequestId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => performance.now());

  let run: AiActionRun = IDLE_RUN;
  let handle: AiCompletionHandle | null = null;
  let consumer: { dispose: () => void } | null = null;
  let activeRequestId: string | null = null;
  let cancelRequested = false;
  let lastRequest: AiCompletionRequest | null = null;
  let repairSpent = false;
  let buffer = "";
  let withdrawFlush: (() => void) | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  function setRun(next: AiActionRun): void {
    if (next === run) {
      return;
    }
    run = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function flushDeltas(): void {
    withdrawFlush?.();
    withdrawFlush = null;
    const chunk = buffer;
    const requestId = activeRequestId;
    buffer = "";
    if (chunk.length > 0 && requestId !== null) {
      setRun(runWithDelta(run, requestId, chunk));
    }
  }

  function requestFlush(): void {
    if (withdrawFlush === null) {
      withdrawFlush = scheduleFlush(flushDeltas);
    }
  }

  function releaseCurrent(): void {
    consumer?.dispose();
    consumer = null;
    handle?.dispose();
    handle = null;
    withdrawFlush?.();
    withdrawFlush = null;
    buffer = "";
  }

  /**
   * A reply that finished is held back from `done` while the repair looks at
   * it, so the writer never sees a result flash up and get withdrawn. The run
   * is still `streaming` for that moment, which keeps Stop meaningful: a cancel
   * settles the run and the repair's answer is then dropped.
   */
  function settleDone(
    request: AiCompletionRequest,
    event: Extract<AiCompletionEvent, { type: "done" }>,
  ): void {
    const repair = options.repair;
    if (repair === undefined || repairSpent) {
      setRun(runWithTerminal(run, event));
      return;
    }
    repairSpent = true;
    function stillCurrent(): boolean {
      return !disposed && activeRequestId === request.requestId && run.phase === "streaming";
    }
    void repair(run.preview, request)
      .then((repaired) => {
        if (!stillCurrent()) {
          return;
        }
        if (repaired === null) {
          setRun(runWithTerminal(run, event));
          return;
        }
        send(repaired);
      })
      .catch(() => {
        if (stillCurrent()) {
          setRun(runWithTerminal(run, event));
        }
      });
  }

  function fire(template: AiCompletionRequest): void {
    if (disposed) {
      return;
    }
    repairSpent = false;
    lastRequest = template;
    send(template);
  }

  function send(template: AiCompletionRequest): void {
    const request = { ...template, requestId: mintRequestId() };
    releaseCurrent();
    activeRequestId = request.requestId;
    cancelRequested = false;
    options.onStart?.();
    setRun(startedRun(request.requestId, now()));

    const ownConsumer = createAiCompletionConsumer(request.requestId, {
      onDelta: (text) => {
        buffer += text;
        requestFlush();
      },
      onTerminal: (event) => {
        flushDeltas();
        handle = null;
        if (event.type === "done") {
          settleDone(request, event);
          return;
        }
        setRun(runWithTerminal(run, event));
      },
    });
    consumer = ownConsumer;

    void startCompletion(
      request,
      options.origin,
      (event) => ownConsumer.accept(event),
      options.signal,
    )
      .then((ownHandle) => {
        if (activeRequestId !== request.requestId || disposed) {
          ownHandle.dispose();
          return;
        }
        handle = ownHandle;
        if (cancelRequested) {
          void ownHandle.cancel().catch(noop);
          return;
        }
        setRun(connectedRun(run, request.requestId));
      })
      .catch((reason: unknown) => {
        if (activeRequestId !== request.requestId || disposed) {
          return;
        }
        ownConsumer.dispose();
        const failure = startErrorMessage(reason);
        setRun(failedRun(run, request.requestId, failure.message, failure.recoveryAction));
      });
  }

  function retry(): void {
    if (run.phase === "streaming" || lastRequest === null) {
      return;
    }
    fire(lastRequest);
  }

  /**
   * Answered here rather than at the provider. The seam is still asked to stop,
   * but a run whose start invocation has not resolved has nothing to ask yet,
   * and one whose provider never acknowledges would leave the writer pressing a
   * dead button. Nothing was written to the note, so ending it locally is safe:
   * the consumer is disposed first, so no straggling delta can reopen it.
   */
  function cancel(): void {
    cancelRequested = true;
    consumer?.dispose();
    flushDeltas();
    void handle?.cancel().catch(noop);
    setRun(stoppedRun(run));
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    releaseCurrent();
    listeners.clear();
  }

  return {
    getRun: () => run,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire,
    retry,
    cancel,
    dispose,
    isDisposed: () => disposed,
  };
}
