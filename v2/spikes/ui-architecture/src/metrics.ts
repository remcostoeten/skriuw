import type {
  EditorCandidate,
  PreparedState,
  ScenarioResult,
  TimingSample,
  TimingSummary,
} from "./types";

type LongTaskEntry = PerformanceEntry & { duration: number };

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function summarize(values: readonly number[]): TimingSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
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

export async function measureScenario(
  candidate: EditorCandidate,
  states: readonly PreparedState[],
  sampleCount: number,
  estimatedFrameMs: number,
  action: (sampleIndex: number, state: PreparedState) => void,
): Promise<ScenarioResult> {
  const longTasks: LongTaskEntry[] = [];
  const observer = typeof PerformanceObserver === "undefined"
    ? null
    : new PerformanceObserver((list) => {
        longTasks.push(...(list.getEntries() as LongTaskEntry[]));
      });
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    observer?.observe({ type: "longtask", buffered: false });
  }

  const warmState = states[1] ?? states[0];
  if (warmState) {
    action(-1, warmState);
    await nextFrame();
  }

  const samples: TimingSample[] = [];
  const measurementStart = performance.now();
  for (let index = 0; index < sampleCount; index += 1) {
    const state = states[(index + 1) % states.length];
    if (!state) {
      continue;
    }
    const frameStart = await nextFrame();
    const started = performance.now();
    action(index, state);
    const syncFinished = performance.now();
    candidate.domNodeCount();
    const layoutFinished = performance.now();
    const paintedAt = await nextFrame();
    samples.push({
      index,
      syncMs: syncFinished - started,
      layoutMs: layoutFinished - syncFinished,
      nextFrameMs: paintedAt - started,
      frameGapMs: paintedAt - frameStart,
    });
  }
  const measurementEnd = performance.now();
  observer?.takeRecords();
  observer?.disconnect();
  const relevantLongTasks = longTasks.filter(
    (entry) => entry.startTime >= measurementStart && entry.startTime <= measurementEnd,
  );
  const droppedThreshold = estimatedFrameMs * 1.5;

  return {
    samples,
    sync: summarize(samples.map((sample) => sample.syncMs)),
    layout: summarize(samples.map((sample) => sample.layoutMs)),
    nextFrame: summarize(samples.map((sample) => sample.nextFrameMs)),
    droppedFrames: samples.filter((sample) => sample.frameGapMs > droppedThreshold).length,
    longTasks: relevantLongTasks.length,
  };
}
