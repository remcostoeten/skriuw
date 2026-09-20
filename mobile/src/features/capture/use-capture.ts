import { useURL } from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { WorkspaceSession } from "../../bridge/commit";
import { newNodeId } from "../../shell/identity";
import type { DateKey } from "../journal/dates";
import type { CaptureRecord, CaptureSource } from "./capture-record";
import { drainCaptureInbox, type CaptureDrainResult } from "./drain";
import { createDeviceCaptureInbox } from "./file-inbox";
import { createCaptureInbox, createMemoryInboxFile, type CaptureInbox } from "./inbox";

export type Capture = {
  /**
   * Queues text durably against a day and then drains, so the capture
   * survives the application being killed between the press and the
   * workspace taking it. It travels the one path a shared capture travels.
   */
  capture: (dateKey: DateKey, text: string) => Promise<CaptureDrainResult>;
  /** The result of the last drain, for the surface that reports it. */
  lastDrain: CaptureDrainResult | null;
};

/**
 * The queue a runtime without the file system falls back to. The browser
 * build of the shell has no device storage and no share sheet either, so a
 * capture there lives as long as the page does, which is exactly as durable
 * as the rest of that runtime.
 */
function openInbox(reportFailure: (error: unknown) => void): CaptureInbox {
  try {
    return createDeviceCaptureInbox();
  } catch (error) {
    reportFailure(error);
    return createCaptureInbox(createMemoryInboxFile());
  }
}

function record(dateKey: DateKey, text: string, source: CaptureSource): CaptureRecord {
  return {
    id: newNodeId(),
    text,
    title: null,
    dateKey,
    source,
    capturedAt: Date.now(),
  };
}

/**
 * Owns the capture queue for as long as the journal is mounted: it drains on
 * mount, whenever the application comes back to the foreground, and whenever
 * a share hands the shell a new link. Draining is idempotent — an empty queue
 * costs one file read — so the three triggers never need to agree.
 */
export function useCapture(session: WorkspaceSession): Capture {
  const { reportFailure } = session;
  const inbox = useMemo(() => openInbox(reportFailure), [reportFailure]);
  const [lastDrain, setLastDrain] = useState<CaptureDrainResult | null>(null);
  const url = useURL();
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  /**
   * Drains are serialised rather than deduplicated: a capture queued while
   * one is in flight has to be read by a pass that starts after the append,
   * or it would wait for an unrelated trigger to notice it.
   */
  const drain = useCallback((): Promise<CaptureDrainResult> => {
    const settled = chain.current.then(
      () => drainCaptureInbox(session, inbox),
      () => drainCaptureInbox(session, inbox),
    );
    chain.current = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled.then((result) => {
      if (result.written > 0 || result.deferred > 0 || result.discarded > 0) {
        setLastDrain(result);
      }
      return result;
    });
  }, [inbox, session]);

  useEffect(() => {
    drain().catch(reportFailure);
  }, [drain, reportFailure, url]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        drain().catch(reportFailure);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [drain, reportFailure]);

  const capture = useCallback(
    async (dateKey: DateKey, text: string) => {
      inbox.append(record(dateKey, text, "quick"));
      return drain();
    },
    [drain, inbox],
  );

  return { capture, lastDrain };
}
