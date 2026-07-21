import "./styles.css";

import { BLOCK_COUNTS, BOUNDED_BLOCK_LIMIT } from "./corpus";
import { createLexicalCandidate } from "./editors/lexical";
import { createLexicalBoundedCandidate } from "./editors/lexical-bounded";
import { createProseMirrorCandidate } from "./editors/prosemirror";
import { createProseMirrorBoundedCandidate } from "./editors/prosemirror-bounded";
import {
  estimateFrameDuration,
  measureMemory,
  measureScenario,
  nextPaint,
} from "./metrics";
import {
  createNativeMeasurement,
  type NativeMeasurement,
} from "./native-metrics";
import type {
  BenchmarkResult,
  BlockCount,
  CandidateId,
  EditorCandidate,
  NativeInteractionResult,
  PreparedState,
  RenderingStrategy,
} from "./types";

const NOTE_COUNT = 8;
const SWITCH_SAMPLES = 100;
const TYPING_SAMPLES = 30;

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("benchmark root was not found");
}

app.innerHTML = `
  <div class="lab-shell">
    <aside class="lab-sidebar">
      <p class="eyebrow">SKRIUW / UI LAB 01</p>
      <h1>Cached editor switching</h1>
      <p class="lede">One outer host. Prepared states. Replacement or retained editors. No router, parser, IPC, database, Git, or lazy loading inside measured navigation.</p>
      <div class="controls">
        <label class="control">
          <span>Editor candidate</span>
          <select id="candidate">
            <option value="prosemirror">Direct ProseMirror</option>
            <option value="lexical">Direct Lexical</option>
          </select>
        </label>
        <label class="control">
          <span>Rendering strategy</span>
          <select id="strategy">
            <option value="replace">Replace active state</option>
            <option value="retained">Retain eight editors</option>
            <option value="bounded">Bound to 192 blocks</option>
          </select>
        </label>
        <label class="control">
          <span>Blocks per note</span>
          <select id="blocks">
            ${BLOCK_COUNTS.map((count) => `<option value="${count}">${count.toLocaleString()} blocks</option>`).join("")}
          </select>
        </label>
        <button id="run" type="button">Run benchmark</button>
        <button id="arm-native" type="button" disabled>Arm native input</button>
        <button id="finish-native" type="button" disabled>Finish native input</button>
      </div>
      <p class="status-line" id="status">Ready. Production-build measurements required for evidence.</p>
    </aside>
    <section class="lab-main" aria-label="Benchmark results">
      <div class="metrics">
        <div class="metric"><span class="metric-label">End-to-layout P95</span><strong class="metric-value" id="switch-p95">—</strong></div>
        <div class="metric"><span class="metric-label">End-to-layout max</span><strong class="metric-value" id="switch-max">—</strong></div>
        <div class="metric"><span class="metric-label">Typing P95</span><strong class="metric-value" id="typing-p95">—</strong></div>
        <div class="metric"><span class="metric-label">Dropped frames</span><strong class="metric-value" id="dropped">—</strong></div>
        <div class="metric"><span class="metric-label">Resident delta</span><strong class="metric-value" id="memory">—</strong></div>
      </div>
      <div class="latency-rail" aria-label="Eight millisecond target within a 16.67 millisecond frame">
        <span class="latency-marker" id="latency-marker" style="left: 0%"></span>
      </div>
      <div class="workspace">
        <div class="workspace-bar"><span id="workspace-label">No candidate mounted</span><span id="native-sentinel">Native input idle</span><span id="dom-count">0 DOM nodes</span></div>
        <div class="editor-host" id="editor-host" aria-label="Editor benchmark host"></div>
      </div>
      <details>
        <summary>Raw measurement JSON</summary>
        <pre id="raw-output">No measurement yet.</pre>
      </details>
    </section>
  </div>
`;

const candidateSelect = requiredElement<HTMLSelectElement>("candidate");
const strategySelect = requiredElement<HTMLSelectElement>("strategy");
const blockSelect = requiredElement<HTMLSelectElement>("blocks");
const runButton = requiredElement<HTMLButtonElement>("run");
const armNativeButton = requiredElement<HTMLButtonElement>("arm-native");
const finishNativeButton = requiredElement<HTMLButtonElement>("finish-native");
const status = requiredElement<HTMLElement>("status");
const host = requiredElement<HTMLElement>("editor-host");
const rawOutput = requiredElement<HTMLElement>("raw-output");
const nativeSentinel = requiredElement<HTMLElement>("native-sentinel");
let activeCandidate: EditorCandidate | null = null;
let activeStates: readonly PreparedState[] = [];
let lastResult: BenchmarkResult | null = null;
let lastNativeResult: NativeInteractionResult | null = null;
let nativeMeasurement: NativeMeasurement | null = null;
let nativeExpectedInteractions = 0;
let nativeHandledInteractions = 0;
let benchmarkRunning = false;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing benchmark element: ${id}`);
  }
  return element as T;
}

function createCandidate(
  id: CandidateId,
  strategy: RenderingStrategy,
): EditorCandidate {
  if (strategy === "bounded") {
    return id === "prosemirror"
      ? createProseMirrorBoundedCandidate()
      : createLexicalBoundedCandidate();
  }
  return id === "prosemirror"
    ? createProseMirrorCandidate(strategy)
    : createLexicalCandidate(strategy);
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`;
}

function formatBytes(value: number | null): string {
  return value === null ? "unsupported" : `${(value / 1_048_576).toFixed(1)} MiB`;
}

function validateBoundedStates(
  states: readonly PreparedState[],
  blockCount: BlockCount,
): void {
  if (states.length !== NOTE_COUNT) {
    throw new Error(`bounded candidate prepared ${states.length} of ${NOTE_COUNT} notes`);
  }
  const stateIds = new Set<string>();
  for (const state of states) {
    const rendered = state.renderedBlockCount ?? Number.POSITIVE_INFINITY;
    const start = state.windowStart ?? -1;
    const end = state.windowEnd ?? -1;
    if (state.canonicalBlockCount !== blockCount
      || rendered <= 0
      || rendered > BOUNDED_BLOCK_LIMIT
      || start < 0
      || end > blockCount
      || end - start !== rendered) {
      throw new Error(`invalid bounded state: ${state.id}`);
    }
    if (stateIds.has(state.id)) {
      throw new Error(`duplicate bounded state: ${state.id}`);
    }
    stateIds.add(state.id);
  }
}

function renderResult(result: BenchmarkResult): void {
  requiredElement("switch-p95").textContent = formatMs(result.switching.settled.p95Ms);
  requiredElement("switch-max").textContent = formatMs(result.switching.settled.maxMs);
  requiredElement("typing-p95").textContent = formatMs(result.typing.settled.p95Ms);
  requiredElement("dropped").textContent = String(
    result.switching.droppedFrames + result.typing.droppedFrames,
  );
  requiredElement("memory").textContent = formatBytes(result.memory?.deltaBytes ?? null);
  requiredElement("workspace-label").textContent = `${result.candidate} · ${result.strategy} · ${result.renderedBlocks.toLocaleString()} of ${result.canonicalBlocks.toLocaleString()} blocks × ${result.noteCount} notes`;
  requiredElement("dom-count").textContent = `${result.activeDomNodes.toLocaleString()} active / ${result.totalDomNodes.toLocaleString()} total DOM elements · ${result.editorInstances} editor instances`;
  const marker = requiredElement<HTMLElement>("latency-marker");
  marker.style.left = `${Math.min(100, (result.switching.settled.p95Ms / 16.67) * 100)}%`;
  rawOutput.textContent = JSON.stringify(result, null, 2);
  const settledPass = result.switching.settled.p95Ms < 8
    && result.switching.settled.maxMs < 16.67
    && result.switching.droppedFrames === 0;
  const invariantPass = result.hostMounts === 1
    && result.preparationCallsBefore === result.preparationCallsAfter;
  const preparationCalls = result.preparationCallsAfter - result.preparationCallsBefore;
  status.textContent = `${settledPass && invariantPass ? "END-TO-LAYOUT PASS" : "REVIEW"} · navigation P95 ${formatMs(result.switching.settled.p95Ms)} · preparation calls during navigation ${preparationCalls}`;
}

function handleNativeKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown"
    || !event.isTrusted
    || event.repeat
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || !nativeMeasurement
    || !activeCandidate
    || activeStates.length === 0
    || nativeHandledInteractions >= nativeExpectedInteractions) {
    return;
  }
  event.preventDefault();
  const index = nativeHandledInteractions;
  const state = activeStates[(index + 1) % activeStates.length];
  if (!state) {
    return;
  }
  const processingStarted = performance.now();
  performance.mark(`skriuw-native-${index}-start`);
  activeCandidate.install(state);
  nativeSentinel.textContent = `Switch ${index + 1} · ${state.id}`;
  nativeHandledInteractions += 1;
  status.textContent = `Native ArrowDown ${nativeHandledInteractions}/${nativeExpectedInteractions} · finish after keyup delivery`;
  const syncFinished = performance.now();
  performance.mark(`skriuw-native-${index}-installed`);
  activeCandidate.layoutHeight();
  const layoutFinished = performance.now();
  performance.mark(`skriuw-native-${index}-layout`);
  nativeMeasurement.record({
    index,
    eventTime: event.timeStamp,
    processingStarted,
    syncMs: syncFinished - processingStarted,
    layoutMs: layoutFinished - syncFinished,
    settledMs: layoutFinished - processingStarted,
  });
}

export function armNativeNavigation(expectedInteractions = 100): void {
  if (benchmarkRunning) {
    throw new Error("wait for the benchmark run to finish before arming native navigation");
  }
  if (!activeCandidate || activeStates.length === 0) {
    throw new Error("run a benchmark before arming native navigation");
  }
  if (nativeMeasurement) {
    throw new Error("native navigation measurement is already armed");
  }
  if (!Number.isInteger(expectedInteractions) || expectedInteractions <= 0) {
    throw new Error("native interaction count must be a positive integer");
  }
  performance.clearMarks();
  nativeExpectedInteractions = expectedInteractions;
  nativeHandledInteractions = 0;
  lastNativeResult = null;
  nativeMeasurement = createNativeMeasurement(expectedInteractions);
  document.addEventListener("keydown", handleNativeKeydown);
  runButton.disabled = true;
  armNativeButton.disabled = true;
  finishNativeButton.disabled = false;
  nativeSentinel.textContent = "Native input armed · press ArrowDown";
  status.textContent = `Waiting for ${expectedInteractions} trusted ArrowDown interactions…`;
}

export async function finishNativeNavigation(): Promise<NativeInteractionResult> {
  const measurement = nativeMeasurement;
  if (!measurement) {
    throw new Error("native navigation measurement is not armed");
  }
  if (nativeHandledInteractions !== nativeExpectedInteractions) {
    throw new Error(
      `native navigation handled ${nativeHandledInteractions} of ${nativeExpectedInteractions} interactions`,
    );
  }
  document.removeEventListener("keydown", handleNativeKeydown);
  nativeMeasurement = null;
  const result = await measurement.finish();
  lastNativeResult = result;
  rawOutput.textContent = JSON.stringify({ benchmark: lastResult, native: result }, null, 2);
  runButton.disabled = false;
  armNativeButton.disabled = false;
  finishNativeButton.disabled = true;
  nativeSentinel.textContent = `${result.handledInteractions} handled · ${result.reportedEventEntries} Event Timing entries`;
  status.textContent = `NATIVE EVIDENCE · ${result.unreportedEventEntries} key events unreported at the 16 ms Event Timing threshold · ${result.longAnimationFrames.length} frames above 50 ms`;
  return result;
}

export async function runBenchmark(
  candidateId = candidateSelect.value as CandidateId,
  blockCount = Number(blockSelect.value) as BlockCount,
  strategy = strategySelect.value as RenderingStrategy,
): Promise<BenchmarkResult> {
  if (benchmarkRunning) {
    throw new Error("a benchmark run is already in progress");
  }
  if (nativeMeasurement) {
    throw new Error("finish native navigation before running another benchmark");
  }
  benchmarkRunning = true;
  runButton.disabled = true;
  armNativeButton.disabled = true;
  try {
  candidateSelect.value = candidateId;
  blockSelect.value = String(blockCount);
  strategySelect.value = strategy;
  status.textContent = "Preparing deterministic editor states outside measured navigation…";
  activeCandidate?.destroy();
  activeCandidate = null;
  activeStates = [];
  host.replaceChildren();
  host.removeAttribute("contenteditable");
  host.className = "editor-host";

  await nextPaint();
  const baselineBytes = await measureMemory();
  const candidate = createCandidate(candidateId, strategy);
  activeCandidate = candidate;
  const preparationStarted = performance.now();
  const states = candidate.prepare(blockCount, NOTE_COUNT);
  if (strategy === "bounded") {
    validateBoundedStates(states, blockCount);
  }
  activeStates = states;
  const preparationMs = performance.now() - preparationStarted;
  const initial = states[0];
  if (!initial) {
    throw new Error("candidate did not prepare an initial state");
  }
  const mountStarted = performance.now();
  candidate.mount(host, states, initial);
  const mountMs = performance.now() - mountStarted;
  status.textContent = `Priming ${NOTE_COUNT} prepared notes outside measured navigation…`;
  const primeStarted = performance.now();
  for (const state of states) {
    candidate.install(state);
    candidate.layoutHeight();
    await nextPaint();
  }
  candidate.install(initial);
  candidate.layoutHeight();
  await nextPaint();
  const primeMs = performance.now() - primeStarted;
  const residentBytes = await measureMemory();
  const estimatedFrameMs = await estimateFrameDuration();
  const preparationCallsBefore = candidate.preparationCount();
  status.textContent = `Measuring ${SWITCH_SAMPLES} cached note switches…`;
  const switching = await measureScenario(
    candidate,
    states,
    SWITCH_SAMPLES,
    estimatedFrameMs,
    (_sampleIndex, state) => candidate.install(state),
  );
  status.textContent = `Measuring ${TYPING_SAMPLES} editor-owned updates…`;
  const typing = await measureScenario(
    candidate,
    [states.at(-1) ?? initial],
    TYPING_SAMPLES,
    estimatedFrameMs,
    (sampleIndex) => candidate.edit(sampleIndex),
  );
  const preparationCallsAfter = candidate.preparationCount();
  if (strategy === "bounded"
    && (candidate.mountCount() !== 1
      || candidate.editorInstanceCount() !== 1
      || candidate.activeDomNodeCount() > 512
      || candidate.totalDomNodeCount() > 512)) {
    throw new Error("bounded editor exceeded its host, instance, or DOM limit");
  }
  const result: BenchmarkResult = {
    candidate: candidate.id,
    strategy,
    blockCount,
    noteCount: NOTE_COUNT,
    canonicalBlocks: blockCount,
    renderedBlocks: initial.renderedBlockCount ?? blockCount,
    windowRanges: strategy === "bounded"
      ? states.map((state) => ({
          start: state.windowStart ?? 0,
          end: state.windowEnd ?? 0,
        }))
      : null,
    preparationMs,
    mountMs,
    primeMs,
    preparationCallsBefore,
    preparationCallsAfter,
    hostMounts: candidate.mountCount(),
    editorInstances: candidate.editorInstanceCount(),
    activeDomNodes: candidate.activeDomNodeCount(),
    totalDomNodes: candidate.totalDomNodeCount(),
    memory: baselineBytes === null || residentBytes === null
      ? null
      : {
          baselineBytes,
          residentBytes,
          deltaBytes: residentBytes - baselineBytes,
          source: "measureUserAgentSpecificMemory",
        },
    estimatedFrameMs,
    switching,
    typing,
    measuredAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };
  lastResult = result;
  renderResult(result);
  return result;
  } finally {
    benchmarkRunning = false;
    runButton.disabled = nativeMeasurement !== null;
    armNativeButton.disabled = nativeMeasurement !== null;
  }
}

runButton.addEventListener("click", () => {
  void runBenchmark().catch((error: unknown) => {
    runButton.disabled = false;
    status.textContent = error instanceof Error ? error.message : "Benchmark failed";
    throw error;
  });
});

armNativeButton.addEventListener("click", () => {
  armNativeNavigation();
});

finishNativeButton.addEventListener("click", () => {
  void finishNativeNavigation();
});

window.__SKRIUW_BENCHMARK__ = {
  run: runBenchmark,
  armNativeNavigation,
  finishNativeNavigation,
  lastResult: () => lastResult,
  lastNativeResult: () => lastNativeResult,
};

declare global {
  interface Window {
    __SKRIUW_BENCHMARK__: {
      run(
        candidate?: CandidateId,
        blockCount?: BlockCount,
        strategy?: RenderingStrategy,
      ): Promise<BenchmarkResult>;
      armNativeNavigation(expectedInteractions?: number): void;
      finishNativeNavigation(): Promise<NativeInteractionResult>;
      lastResult(): BenchmarkResult | null;
      lastNativeResult(): NativeInteractionResult | null;
    };
  }
}
