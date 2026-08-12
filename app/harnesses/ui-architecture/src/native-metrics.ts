import { nextPaint } from "./metrics";
import type {
  EventTimingRecord,
  LongAnimationFrameRecord,
  NativeHandlerSample,
  NativeInteractionResult,
} from "./types";

type EventEntry = PerformanceEntry & {
  processingStart: number;
  processingEnd: number;
  interactionId: number;
};

type LongAnimationFrameEntry = PerformanceEntry & {
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  firstUIEventTimestamp: number;
};

export type NativeMeasurement = {
  record(sample: NativeHandlerSample): void;
  finish(): Promise<NativeInteractionResult>;
};

function toEventRecord(entry: EventEntry): EventTimingRecord {
  return {
    name: entry.name,
    startTime: entry.startTime,
    durationMs: entry.duration,
    processingStart: entry.processingStart,
    processingEnd: entry.processingEnd,
    interactionId: entry.interactionId,
    inputDelayMs: entry.processingStart - entry.startTime,
    processingMs: entry.processingEnd - entry.processingStart,
    quantizedPresentationDelayMs: Math.max(
      0,
      entry.startTime + entry.duration - entry.processingEnd,
    ),
  };
}

function toLongAnimationFrameRecord(
  entry: LongAnimationFrameEntry,
): LongAnimationFrameRecord {
  return {
    startTime: entry.startTime,
    durationMs: entry.duration,
    blockingDurationMs: entry.blockingDuration,
    renderStart: entry.renderStart,
    styleAndLayoutStart: entry.styleAndLayoutStart,
    firstUIEventTimestamp: entry.firstUIEventTimestamp,
  };
}

export function createNativeMeasurement(
  expectedInteractions: number,
): NativeMeasurement {
  const startedAt = performance.now();
  const handlerSamples: NativeHandlerSample[] = [];
  const eventEntries: EventEntry[] = [];
  const longAnimationFrameEntries: LongAnimationFrameEntry[] = [];
  const eventTimingSupported = typeof PerformanceObserver !== "undefined"
    && PerformanceObserver.supportedEntryTypes.includes("event");
  const longAnimationFramesSupported = typeof PerformanceObserver !== "undefined"
    && PerformanceObserver.supportedEntryTypes.includes("long-animation-frame");
  const eventObserver = eventTimingSupported
    ? new PerformanceObserver((list) => {
        eventEntries.push(...(list.getEntries() as EventEntry[]));
      })
    : null;
  const longAnimationFrameObserver = longAnimationFramesSupported
    ? new PerformanceObserver((list) => {
        longAnimationFrameEntries.push(
          ...(list.getEntries() as LongAnimationFrameEntry[]),
        );
      })
    : null;

  eventObserver?.observe({
    type: "event",
    buffered: false,
    durationThreshold: 16,
  } as PerformanceObserverInit);
  longAnimationFrameObserver?.observe({
    type: "long-animation-frame",
    buffered: false,
  });

  return {
    record(sample) {
      handlerSamples.push(sample);
    },
    async finish() {
      await nextPaint();
      eventEntries.push(...((eventObserver?.takeRecords() ?? []) as EventEntry[]));
      longAnimationFrameEntries.push(
        ...((longAnimationFrameObserver?.takeRecords() ?? []) as LongAnimationFrameEntry[]),
      );
      eventObserver?.disconnect();
      longAnimationFrameObserver?.disconnect();
      const entries = eventEntries
        .filter((entry) => entry.startTime >= startedAt)
        .filter((entry) => entry.name === "keydown")
        .filter((entry) => handlerSamples.some(
          (sample) => Math.abs(sample.eventTime - entry.startTime) < 0.5,
        ))
        .map(toEventRecord);
      const reportedInteractions = new Set(
        entries
          .map((entry) => entry.interactionId)
          .filter((interactionId) => interactionId > 0),
      ).size;
      const longAnimationFrames = longAnimationFrameEntries
        .filter((entry) => entry.startTime + entry.duration >= startedAt)
        .map(toLongAnimationFrameRecord);
      return {
        supported: eventTimingSupported,
        expectedInteractions,
        handledInteractions: handlerSamples.length,
        reportedEventEntries: entries.length,
        reportedInteractions,
        unreportedEventEntries: Math.max(
          0,
          handlerSamples.length - entries.length,
        ),
        durationThresholdMs: 16,
        handlerSamples,
        entries,
        longAnimationFramesSupported,
        longAnimationFrames,
      };
    },
  };
}
