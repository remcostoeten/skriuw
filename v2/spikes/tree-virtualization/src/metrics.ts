import type {
  LongFrameStats,
  LongTaskStats,
  ScenarioResult,
  TimingSample,
  TimingSummary,
} from "./types";

export const LONG_TASK_THRESHOLD_MS = 50;
export const LONG_FRAME_THRESHOLD_MS = 50;
export const EVENT_TIMING_MIN_THRESHOLD_MS = 16;

type DurationEntry = PerformanceEntry & { duration: number };

type LongFrameEntry = DurationEntry & { blockingDuration?: number };

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export async function afterTwoFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

export function summarize(values: readonly number[]): TimingSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

export function supportsEntryType(entryType: string): boolean {
  return (
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes.includes(entryType)
  );
}

export async function estimateFrameDuration(): Promise<number> {
  const frames: number[] = [];
  let previous = await nextFrame();
  for (let index = 0; index < 12; index += 1) {
    const current = await nextFrame();
    frames.push(current - previous);
    previous = current;
  }
  return summarize(frames).p50Ms;
}

export type BlockingObservation = {
  stop(startedAt: number, endedAt: number): { longTasks: LongTaskStats; longFrames: LongFrameStats };
};

export function observeBlocking(): BlockingObservation {
  const taskEntries: DurationEntry[] = [];
  const frameEntries: LongFrameEntry[] = [];
  const taskSupported = supportsEntryType("longtask");
  const frameSupported = supportsEntryType("long-animation-frame");

  const taskObserver = taskSupported
    ? new PerformanceObserver((list) => {
        taskEntries.push(...(list.getEntries() as DurationEntry[]));
      })
    : null;
  taskObserver?.observe({ type: "longtask", buffered: false });

  const frameObserver = frameSupported
    ? new PerformanceObserver((list) => {
        frameEntries.push(...(list.getEntries() as LongFrameEntry[]));
      })
    : null;
  frameObserver?.observe({ type: "long-animation-frame", buffered: false });

  return {
    stop(startedAt, endedAt) {
      taskEntries.push(...((taskObserver?.takeRecords() ?? []) as DurationEntry[]));
      frameEntries.push(...((frameObserver?.takeRecords() ?? []) as LongFrameEntry[]));
      taskObserver?.disconnect();
      frameObserver?.disconnect();
      const tasks = taskEntries.filter(
        (entry) => entry.startTime >= startedAt && entry.startTime <= endedAt,
      );
      const frames = frameEntries.filter(
        (entry) => entry.startTime >= startedAt && entry.startTime <= endedAt,
      );
      return {
        longTasks: {
          supported: taskSupported,
          thresholdMs: LONG_TASK_THRESHOLD_MS,
          count: tasks.length,
          maxDurationMs: tasks.reduce((max, entry) => Math.max(max, entry.duration), 0),
        },
        longFrames: {
          supported: frameSupported,
          thresholdMs: LONG_FRAME_THRESHOLD_MS,
          count: frames.length,
          maxDurationMs: frames.reduce((max, entry) => Math.max(max, entry.duration), 0),
          maxBlockingMs: frames.reduce(
            (max, entry) => Math.max(max, entry.blockingDuration ?? 0),
            0,
          ),
        },
      };
    },
  };
}

export async function measureScenario(
  name: string,
  sampleCount: number,
  estimatedFrameMs: number,
  layoutProbe: () => number,
  mutatedRowsProbe: () => number,
  action: (sampleIndex: number) => void,
  prepare?: (sampleIndex: number) => void,
): Promise<ScenarioResult> {
  const blocking = observeBlocking();
  prepare?.(-1);
  action(-1);
  layoutProbe();
  await nextFrame();

  const samples: TimingSample[] = [];
  const measurementStart = performance.now();
  for (let index = 0; index < sampleCount; index += 1) {
    prepare?.(index);
    const frameStart = await nextFrame();
    const mutatedBefore = mutatedRowsProbe();
    const started = performance.now();
    action(index);
    const syncFinished = performance.now();
    layoutProbe();
    const layoutFinished = performance.now();
    const paintedAt = await nextFrame();
    samples.push({
      index,
      syncMs: syncFinished - started,
      layoutMs: layoutFinished - syncFinished,
      settledMs: layoutFinished - started,
      nextFrameMs: paintedAt - started,
      frameGapMs: paintedAt - frameStart,
      mutatedRows: mutatedRowsProbe() - mutatedBefore,
    });
  }
  const measurementEnd = performance.now();
  const { longTasks, longFrames } = blocking.stop(measurementStart, measurementEnd);
  const droppedThreshold = estimatedFrameMs * 1.5;

  return {
    name,
    samples,
    sync: summarize(samples.map((sample) => sample.syncMs)),
    layout: summarize(samples.map((sample) => sample.layoutMs)),
    settled: summarize(samples.map((sample) => sample.settledMs)),
    nextFrame: summarize(samples.map((sample) => sample.nextFrameMs)),
    droppedFrames: samples.filter((sample) => sample.frameGapMs > droppedThreshold).length,
    maxMutatedRows: samples.reduce((max, sample) => Math.max(max, sample.mutatedRows), 0),
    longTasks,
    longFrames,
  };
}
