import { useEffect, useRef, useState } from "react";
import type { AiCompletionRequest } from "@/contracts/ai";
import { noop } from "@/shared/lib/noop";
import { startAiCompletion, type AiCompletionHandle } from "./completion-bridge";
import { createAiCompletionConsumer } from "./completion-consumer";
import {
  IDLE_RUN,
  failedRun,
  runWithDelta,
  runWithTerminal,
  startedRun,
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

  function fire(request: AiCompletionRequest): void {
    consumerRef.current?.dispose();
    handleRef.current?.dispose();
    handleRef.current = null;
    bufferRef.current = "";
    lastRequestRef.current = request;
    activeRequestIdRef.current = request.requestId;
    cancelRequestedRef.current = false;
    onStartRef.current?.();
    setRun(startedRun(request.requestId));

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
        }
      })
      .catch((reason: unknown) => {
        if (activeRequestIdRef.current !== request.requestId) {
          return;
        }
        consumer.dispose();
        setRun((current) => failedRun(current, request.requestId, errorMessage(reason)));
      });
  }

  function retry(): void {
    const previous = lastRequestRef.current;
    if (run.phase === "streaming" || previous === null) {
      return;
    }
    fire({ ...previous, requestId: crypto.randomUUID() });
  }

  function cancel(): void {
    cancelRequestedRef.current = true;
    void handleRef.current?.cancel().catch(noop);
  }

  return { run, fire, retry, cancel };
}
