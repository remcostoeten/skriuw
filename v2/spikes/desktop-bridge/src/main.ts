import { invoke } from "@tauri-apps/api/core";

type BridgeResponse = {
  sequence: number;
  payloadBytes: number;
};

type Summary = {
  samples: number[];
  totalMs: number;
  throughputMeanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

type NavigationResult = {
  commandCountBefore: number;
  commandCountAfter: number;
  activeNote: number;
  summary: Summary;
};

type OptimisticResult = {
  dispatch: Summary;
  acknowledgement: Summary;
  acknowledgementOrder: number[];
  frameGapsMs: number[];
  droppedFrames: number;
};

type BenchmarkResult = {
  navigation: NavigationResult;
  echoEmpty: Summary;
  echoOneKilobyte: Summary;
  echoSixtyFourKilobytes: Summary;
  runtimeRoundTrip: Summary;
  optimistic: OptimisticResult;
  measuredAt: string;
  userAgent: string;
};

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`bridge benchmark element is missing: ${selector}`);
  return element;
}

const status = requiredElement("#status");
const output = requiredElement("#result");

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

function summarize(samples: readonly number[], totalMs: number): Summary {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: [...samples],
    totalMs,
    throughputMeanMs: samples.length === 0 ? 0 : totalMs / samples.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

async function commandCount(): Promise<number> {
  return invoke<number>("command_count");
}

async function measureNavigation(): Promise<NavigationResult> {
  const commandCountBefore = await commandCount();
  const samples: number[] = [];
  let activeNote = 0;
  const started = performance.now();
  for (let index = 0; index < 1_000; index += 1) {
    const started = performance.now();
    activeNote = (activeNote + 1) % 5_000;
    document.body.dataset.activeNote = String(activeNote);
    samples.push(performance.now() - started);
  }
  const totalMs = performance.now() - started;
  const commandCountAfter = await commandCount();
  if (commandCountAfter !== commandCountBefore) {
    throw new Error("navigation crossed the desktop bridge");
  }
  return {
    commandCountBefore,
    commandCountAfter,
    activeNote,
    summary: summarize(samples, totalMs),
  };
}

async function measureEcho(payloadBytes: number, count: number): Promise<Summary> {
  const payload = "x".repeat(payloadBytes);
  for (let index = 0; index < 20; index += 1) {
    await invoke<BridgeResponse>("echo", { sequence: index, payload });
  }
  const samples: number[] = [];
  const allStarted = performance.now();
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    const response = await invoke<BridgeResponse>("echo", { sequence: index, payload });
    samples.push(performance.now() - started);
    if (response.sequence !== index || response.payloadBytes !== payloadBytes) {
      throw new Error("echo response lost its request identity");
    }
  }
  return summarize(samples, performance.now() - allStarted);
}

async function measureRuntime(count: number): Promise<Summary> {
  for (let index = 0; index < 20; index += 1) {
    await invoke<BridgeResponse>("runtime_round_trip", {
      sequence: index,
      payload: "warmup",
    });
  }
  const samples: number[] = [];
  const allStarted = performance.now();
  for (let index = 0; index < count; index += 1) {
    const payload = `runtime-${index}`;
    const started = performance.now();
    const response = await invoke<BridgeResponse>("runtime_round_trip", {
      sequence: index,
      payload,
    });
    samples.push(performance.now() - started);
    if (response.sequence !== index || response.payloadBytes !== payload.length) {
      throw new Error("runtime response lost its request identity");
    }
  }
  return summarize(samples, performance.now() - allStarted);
}

async function measureOptimistic(count: number): Promise<OptimisticResult> {
  const dispatchSamples: number[] = [];
  const acknowledgementSamples: number[] = [];
  const acknowledgementOrder: number[] = [];
  const pending: Promise<void>[] = [];
  const frameGapsMs: number[] = [];
  let previousFrame = performance.now();
  let watchingFrames = true;
  function watchFrame(timestamp: number): void {
    frameGapsMs.push(timestamp - previousFrame);
    previousFrame = timestamp;
    if (watchingFrames) requestAnimationFrame(watchFrame);
  }
  requestAnimationFrame(watchFrame);
  let localRevision = 0;
  const allStarted = performance.now();
  const dispatchStarted = performance.now();
  for (let index = 0; index < count; index += 1) {
    const acknowledgementStarted = performance.now();
    const singleDispatchStarted = performance.now();
    localRevision += 1;
    document.body.dataset.localRevision = String(localRevision);
    const acknowledgement = invoke<BridgeResponse>("runtime_round_trip", {
      sequence: index,
      payload: `optimistic-${index}`,
    }).then((response) => {
      acknowledgementSamples.push(performance.now() - acknowledgementStarted);
      acknowledgementOrder.push(response.sequence);
      if (response.sequence !== index) throw new Error("optimistic acknowledgement was reordered");
    });
    dispatchSamples.push(performance.now() - singleDispatchStarted);
    pending.push(acknowledgement);
  }
  const dispatchTotalMs = performance.now() - dispatchStarted;
  await Promise.all(pending);
  const settlementTotalMs = performance.now() - allStarted;
  if (acknowledgementOrder.some((sequence, index) => sequence !== index)) {
    throw new Error("optimistic acknowledgements did not resolve in FIFO order");
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  watchingFrames = false;
  const estimatedFrameMs = percentile(
    [...frameGapsMs].sort((left, right) => left - right),
    0.5,
  );
  return {
    dispatch: summarize(dispatchSamples, dispatchTotalMs),
    acknowledgement: summarize(acknowledgementSamples, settlementTotalMs),
    acknowledgementOrder,
    frameGapsMs,
    droppedFrames: frameGapsMs.filter((gap) => gap > estimatedFrameMs * 1.5).length,
  };
}

async function run(): Promise<void> {
  status.textContent = "Measuring navigation and desktop bridge paths…";
  const result: BenchmarkResult = {
    navigation: await measureNavigation(),
    echoEmpty: await measureEcho(0, 200),
    echoOneKilobyte: await measureEcho(1_024, 200),
    echoSixtyFourKilobytes: await measureEcho(65_536, 100),
    runtimeRoundTrip: await measureRuntime(200),
    optimistic: await measureOptimistic(100),
    measuredAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };
  output.textContent = JSON.stringify(result, null, 2);
  status.textContent = "Measurement complete.";
  await invoke("publish_result", { result });
}

void run().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  status.textContent = message;
  await invoke("publish_failure", { message });
});
