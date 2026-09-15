import { useCallback, useEffect, useRef, useState } from "react";
import type { AiCompletionRequest } from "@/contracts/ai";
import { noop } from "@/shared/lib/noop";
import { startAiCompletion, type AiCompletionHandle } from "./completion-bridge";
import { createAiCompletionConsumer } from "./completion-consumer";
import {
  IDLE_RUN,
  connectedRun,
  failedRun,
  runWithDelta,
  runWithTerminal,
  startedRun,
  stoppedRun,
  type AiActionRun,
} from "./editor-action-model";

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

export type AiRunController = {
  run: AiActionRun;
  /** Starts a run, replacing any run already in flight. */
  fire: (request: AiCompletionRequest) => void;
  /** Re-sends the last request under a fresh id. No-op before a first run. */
  retry: () => void;
  cancel: () => void;
};

type Options = {
  /** Recorded with the run at the provider seam, e.g. `editor:lengthen`. */
  origin: string;
  onStart?: () => void;
};

/**
 * Owns one streaming completion. Deltas accumulate in React state and nowhere
 * else — the canonical document is never a stream target — and are flushed on
 * an animation frame so a fast provider cannot re-render per token.
 */
export function useAiRun(signal: AbortSignal, { origin, onStart }: Options): AiRunController {
  const [run, setRun] = useState<AiActionRun>(IDLE_RUN);

  const handleRef = useRef<AiCompletionHandle | null>(null);
  const consumerRef = useRef<{ dispose: () => void } | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const lastRequestRef = useRef<AiCompletionRequest | null>(null);
  const bufferRef = useRef("");
  const flushFrameRef = useRef<number | null>(null);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  useEffect(
    () => () => {
      consumerRef.current?.dispose();
      handleRef.current?.dispose();
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
    },
    [],
  );

  function flushDeltas(): void {
    flushFrameRef.current = null;
    const chunk = bufferRef.current;
    const requestId = activeRequestIdRef.current;
    bufferRef.current = "";
    if (chunk.length > 0 && requestId !== null) {
      setRun((current) => runWithDelta(current, requestId, chunk));
    }
  }

  function scheduleFlush(): void {
    if (flushFrameRef.current === null) {
      flushFrameRef.current = requestAnimationFrame(flushDeltas);
    }
  }

  /**
   * Stable across renders so a caller can start a run from an effect keyed on
   * the request alone. A caller guarding with a "have I fired yet" ref instead
   * cannot re-fire when the effect is torn down and replayed, and the run is
   * then left with a disposed consumer and no way back.
   */
  const fire = useCallback(function fire(request: AiCompletionRequest): void {
    consumerRef.current?.dispose();
    handleRef.current?.dispose();
    handleRef.current = null;
    bufferRef.current = "";
    lastRequestRef.current = request;
    activeRequestIdRef.current = request.requestId;
    cancelRequestedRef.current = false;
    onStartRef.current?.();
    setRun(startedRun(request.requestId, performance.now()));

    const consumer = createAiCompletionConsumer(request.requestId, {
      onDelta: (text) => {
        bufferRef.current += text;
        scheduleFlush();
      },
      onTerminal: (event) => {
        flushDeltas();
        handleRef.current = null;
        setRun((current) => runWithTerminal(current, event));
      },
    });
    consumerRef.current = consumer;

    void startAiCompletion(request, origin, (event) => consumer.accept(event), signal)
      .then((handle) => {
        if (activeRequestIdRef.current !== request.requestId) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        if (cancelRequestedRef.current) {
          void handle.cancel().catch(noop);
          return;
        }
        setRun((current) => connectedRun(current, request.requestId));
      })
      .catch((reason: unknown) => {
        if (activeRequestIdRef.current !== request.requestId) {
          return;
        }
        consumer.dispose();
        setRun((current) => failedRun(current, request.requestId, errorMessage(reason)));
      });
  }, [origin, signal]);

  function retry(): void {
    const previous = lastRequestRef.current;
    if (run.phase === "streaming" || previous === null) {
      return;
    }
    fire({ ...previous, requestId: crypto.randomUUID() });
  }

  /**
   * Answered here rather than at the provider. The seam is still asked to stop,
   * but a run whose start invocation has not resolved has nothing to ask yet,
   * and one whose provider never acknowledges would leave the writer pressing a
   * dead button. Nothing was written to the note, so ending it locally is safe:
   * the consumer is disposed first, so no straggling delta can reopen it.
   */
  function cancel(): void {
    cancelRequestedRef.current = true;
    consumerRef.current?.dispose();
    flushDeltas();
    void handleRef.current?.cancel().catch(noop);
    setRun(stoppedRun);
  }

  return { run, fire, retry, cancel };
}
