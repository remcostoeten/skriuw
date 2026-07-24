import { readLedger, resetLedger } from "./ledger";
import { treeLayout } from "./TreeHost";
import { flushSync } from "react-dom";
import type {
  CorrectnessCheck,
  RendererStore,
  ScenarioResult,
  TimingSummary,
  TreeProjection,
} from "./types";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function summarize(samplesMs: readonly number[]): TimingSummary {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const at = (fraction: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
  return { p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: sorted.at(-1) ?? 0 };
}

function renderDelta(before: Record<string, number>, after: Record<string, number>) {
  const delta: Record<string, number> = {};
  for (const [name, count] of Object.entries(after)) {
    const difference = count - (before[name] ?? 0);
    if (difference > 0) {
      delta[name] = difference;
    }
  }
  return delta;
}

async function measureScenario(
  store: RendererStore,
  name: string,
  actions: readonly (() => void)[],
): Promise<ScenarioResult> {
  await nextFrame();
  store.resetDiagnostics();
  resetLedger();
  const before = readLedger();
  const samplesMs: number[] = [];
  const frameGapsMs: number[] = [];
  const expectedTreeRowRenders: Record<string, number> = {};
  const rowSignatures = () =>
    new Map(
      [...document.querySelectorAll<HTMLElement>("[data-node-id]")].map((row) => [
        row.dataset["nodeId"] ?? "",
        [
          row.getAttribute("aria-selected"),
          row.getAttribute("aria-expanded"),
          row.getAttribute("aria-disabled"),
          row.getAttribute("tabindex"),
          row.style.transform,
        ].join("|"),
      ]),
    );
  for (const action of actions) {
    const rowsBefore = rowSignatures();
    const started = performance.now();
    flushSync(action);
    document.documentElement.offsetHeight;
    const settled = performance.now();
    for (const [id, signature] of rowSignatures()) {
      if (rowsBefore.get(id) !== signature) {
        const name = `TreeRow:${id}`;
        expectedTreeRowRenders[name] = (expectedTreeRowRenders[name] ?? 0) + 1;
      }
    }
    samplesMs.push(settled - started);
    await nextFrame();
    frameGapsMs.push(performance.now() - started);
  }
  const after = readLedger();
  return {
    name,
    samplesMs,
    frameGapsMs,
    droppedFrames: frameGapsMs.filter((duration) => duration > 25).length,
    timing: summarize(samplesMs),
    notifications: store.diagnostics().notifications,
    commits: after.commits,
    renders: renderDelta(before.renders, after.renders),
    profiledRenders: renderDelta(before.profiledRenders, after.profiledRenders),
    expectedTreeRowRenders,
  };
}

function noteIds(store: RendererStore): string[] {
  return store
    .getState()
    .nodeOrder.filter((id) => store.getState().nodes.get(id)?.kind === "note" && !store.getState().disabledIds.has(id));
}

function selectCycle(ids: readonly string[], count: number): (() => void)[] {
  const anchors = [
    ...ids.slice(0, 34),
    ...ids.slice(Math.max(0, Math.floor(ids.length / 2) - 17), Math.floor(ids.length / 2) + 17),
    ...ids.slice(-34),
  ];
  return Array.from({ length: count }, (_, position) => () => {
    const id = anchors[position % anchors.length];
    if (id) {
      getBenchmarkWindow().__SKRIUW_ACTIVE_STORE__.setActiveNote(id);
    }
  });
}

function createTrustedAnchors(store: RendererStore): string[] {
  const state = store.getState();
  const candidates = state.visibleIds.flatMap((id, position) => {
    const nextId = state.visibleIds[position + 1];
    const node = state.nodes.get(id);
    const nextNode = nextId ? state.nodes.get(nextId) : undefined;
    if (
      node?.kind !== "note" ||
      nextNode?.kind !== "note" ||
      state.disabledIds.has(id) ||
      state.disabledIds.has(nextId ?? "")
    ) {
      return [];
    }
    return [{ id, position }];
  });
  const regionSize = Math.max(1, Math.ceil(state.visibleIds.length / 3));
  const regions = [0, 1, 2].map((region) =>
    candidates.filter(({ position }) => Math.min(2, Math.floor(position / regionSize)) === region),
  );
  const counts = [34, 33, 33];
  return regions.flatMap((region, regionIndex) => {
    const source = region.length > 0 ? region : candidates;
    return Array.from({ length: counts[regionIndex] ?? 0 }, (_, position) => {
      const candidate = source[position % source.length];
      if (!candidate) {
        throw new Error("fixture has no consecutive enabled note pair for trusted navigation");
      }
      return candidate.id;
    });
  });
}

async function runCorrectness(store: RendererStore): Promise<CorrectnessCheck[]> {
  const checks: CorrectnessCheck[] = [];
  const ids = noteIds(store);
  for (const id of store.getState().nodeOrder) {
    const node = store.getState().nodes.get(id);
    if (node?.kind === "folder" && !store.getState().expandedIds.has(id)) {
      store.toggleExpanded(id);
    }
  }
  await nextFrame();
  const tree = document.querySelector<HTMLElement>("[role='tree']");
  const firstPosition = ids[0] ? store.getState().visibleIds.indexOf(ids[0]) : -1;
  if (tree && firstPosition >= 0) {
    tree.scrollTop = firstPosition * treeLayout.rowHeightPx;
    tree.dispatchEvent(new Event("scroll"));
    await nextFrame();
  }
  const mountedNotes = [...document.querySelectorAll<HTMLElement>("[data-kind='note']")]
    .map((row) => row.dataset["nodeId"])
    .filter((id): id is string => Boolean(id));
  const first = mountedNotes[0] ?? null;
  const second = mountedNotes[1] ?? null;
  if (first && second) {
    store.setActiveNote(first);
    await nextFrame();
    resetLedger();
    store.resetDiagnostics();
    store.setActiveNote(second);
    await nextFrame();
    const selectionLedger = readLedger();
    const renderedRows = Object.keys(selectionLedger.renders).filter((name) => name.startsWith("TreeRow:"));
    checks.push({
      name: "selection-isolates-shell-and-host",
      pass:
        !selectionLedger.renders["ApplicationShell"] &&
        !selectionLedger.renders["EditorHost"] &&
        renderedRows.length === 2 &&
        renderedRows.every((name) => name === `TreeRow:${first}` || name === `TreeRow:${second}`) &&
        (selectionLedger.mounts["EditorHost"] ?? 0) === 1,
      detail: JSON.stringify(selectionLedger),
    });
  }

  store.resetDiagnostics();
  resetLedger();
  const state = store.getState();
  store.update((current) => current);
  await nextFrame();
  checks.push({
    name: "equivalent-state-is-silent",
    pass: store.getState() === state && store.diagnostics().notifications === 0 && readLedger().commits === 0,
    detail: JSON.stringify({ diagnostics: store.diagnostics(), ledger: readLedger() }),
  });

  const folder = store.getState().nodeOrder.find((id) => store.getState().nodes.get(id)?.kind === "folder");
  const active = store.getState().activeNoteId;
  if (folder && active) {
    resetLedger();
    store.toggleExpanded(folder);
    await nextFrame();
    const expansionLedger = readLedger();
    checks.push({
      name: "expansion-isolates-editor-metadata",
      pass:
        store.getState().activeNoteId === active &&
        !expansionLedger.renders["EditorSelectionConsumer"] &&
        !expansionLedger.renders["MetadataTitle"] &&
        !expansionLedger.renders["MetadataWordCount"] &&
        !expansionLedger.renders["MetadataUpdatedAt"],
      detail: JSON.stringify(expansionLedger.renders),
    });
    store.toggleExpanded(folder);
    await nextFrame();
  }

  const editor = document.querySelector<HTMLTextAreaElement>("[data-owned-updates]");
  if (editor) {
    store.resetDiagnostics();
    resetLedger();
    editor.value += "x";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: "x", inputType: "insertText" }));
    await nextFrame();
    checks.push({
      name: "editor-typing-is-owned",
      pass: Object.keys(readLedger().renders).length === 0 && store.diagnostics().notifications === 0,
      detail: JSON.stringify(readLedger()),
    });
  }
  const renderedRows = document.querySelectorAll("[data-node-id]").length;
  const rowCeiling = Math.ceil(treeLayout.viewportHeightPx / treeLayout.rowHeightPx) + 1 + treeLayout.overscanRows * 2;
  checks.push({
    name: "row-pool-bounded",
    pass: renderedRows <= rowCeiling,
    detail: `${renderedRows} rendered rows <= ${rowCeiling}`,
  });
  return checks;
}

type RendererAutomation = {
  run: () => Promise<unknown>;
  prepareTrusted: () => { visibleRows: number; anchors: string[] };
  positionTrusted: (id: string) => string;
  confirmTrusted: (expectedId: string) => void;
  finishTrusted: () => Promise<unknown>;
  galleryChecks: () => unknown[];
  destroy: () => number;
};

type BenchmarkWindow = Window & {
  __SKRIUW_ACTIVE_STORE__: RendererStore;
  __SKRIUW_RENDERER_STORE__: RendererAutomation;
};

function getBenchmarkWindow(): BenchmarkWindow {
  return window as unknown as BenchmarkWindow;
}

export function installBenchmark(store: RendererStore, projection: TreeProjection): void {
  const benchmarkWindow = getBenchmarkWindow();
  benchmarkWindow.__SKRIUW_ACTIVE_STORE__ = store;
  let trustedStart = 0;
  let trustedKeys = 0;
  let trustedSelections = 0;
  let trustedHandlerMs: number[] = [];
  let eventTiming: { durationMs: number; processingMs: number }[] = [];
  let eventObserver: PerformanceObserver | null = null;
  let eventTimingSupported = false;
  let trustedLongTasks: number[] = [];
  let trustedLongFrames: { durationMs: number; blockingMs: number }[] = [];
  let trustedObservers: PerformanceObserver[] = [];
  let running = false;
  const onTrustedKeyDown = (event: KeyboardEvent) => {
    if (trustedStart === 0 || !event.isTrusted || event.key !== "ArrowDown") {
      return;
    }
    const started = performance.now();
    trustedKeys += 1;
    requestAnimationFrame(() => {
      trustedHandlerMs.push(performance.now() - started);
    });
  };
  window.addEventListener("keydown", onTrustedKeyDown, { capture: true });

  benchmarkWindow.__SKRIUW_RENDERER_STORE__ = {
    async run() {
      if (running || trustedStart !== 0) {
        throw new Error("benchmark lifecycle already active");
      }
      running = true;
      const ids = noteIds(store);
      const folders = store
        .getState()
        .nodeOrder.filter((id) => store.getState().nodes.get(id)?.kind === "folder");
      const editor = document.querySelector<HTMLTextAreaElement>("[data-owned-updates]");
      const active = store.getState().activeNoteId ?? ids[0] ?? "";
      const longTasks: number[] = [];
      const longFrames: { durationMs: number; blockingMs: number }[] = [];
      const observers: PerformanceObserver[] = [];
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          longTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        longTaskObserver.observe({ type: "longtask" });
        observers.push(longTaskObserver);
      } catch {
        longTasks.length = 0;
      }
      try {
        const longFrameObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const frame = entry as PerformanceEntry & { blockingDuration?: number };
            longFrames.push({ durationMs: frame.duration, blockingMs: frame.blockingDuration ?? 0 });
          }
        });
        longFrameObserver.observe({ type: "long-animation-frame" });
        observers.push(longFrameObserver);
      } catch {
        longFrames.length = 0;
      }
      try {
        const scenarios: ScenarioResult[] = [];
        scenarios.push(await measureScenario(store, "selection-diagnostic-100", selectCycle(ids, 100)));
      scenarios.push(
        await measureScenario(store, "direct-active-note-100", selectCycle([...ids].reverse(), 100)),
      );
      scenarios.push(
        await measureScenario(
          store,
          "expand-collapse-40",
          Array.from({ length: 40 }, (_, position) => () => {
            const id = folders[position % Math.max(1, folders.length)];
            if (id) {
              store.toggleExpanded(id);
            }
          }),
        ),
      );
      scenarios.push(
        await measureScenario(
          store,
          "editor-owned-typing-30",
          Array.from({ length: 30 }, () => () => {
            if (editor) {
              editor.value += "x";
              editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: "x", inputType: "insertText" }));
            }
          }),
        ),
      );
      flushSync(() => store.setActiveNote(active));
      await nextFrame();
      scenarios.push(
        await measureScenario(
          store,
          "metadata-title-30",
          Array.from({ length: 30 }, (_, position) => () =>
            store.setMetadataTitle(active, `Measured title ${position % 2}`),
          ),
        ),
      );
      scenarios.push(
        await measureScenario(
          store,
          "equivalent-update-100",
          Array.from({ length: 100 }, () => () => store.update((current) => current)),
        ),
      );
      const baselineListeners = store.diagnostics().listenerCount;
      const teardowns: (() => void)[] = [];
      scenarios.push(
        await measureScenario(
          store,
          "subscription-setup-100",
          Array.from({ length: 100 }, () => () => {
            teardowns.push(
              store.subscribe((state) => state.settingsSelection, () => undefined),
            );
          }),
        ),
      );
      scenarios.push(
        await measureScenario(
          store,
          "subscription-teardown-100",
          teardowns.map((teardown) => () => teardown()),
        ),
      );
      const correctness = await runCorrectness(store);
      return {
        fixture: projection.metadata.name,
        operationsDigest: projection.operationsDigest,
        profileBuild: __PROFILE_BUILD__,
        scenarios,
        correctness,
        diagnostics: {
          ...store.diagnostics(),
          baselineListeners,
          listenerLeak: store.diagnostics().listenerCount - baselineListeners,
        },
        ledger: readLedger(),
        browserObservers: {
          longTasks,
          longFrames,
        },
        dom: {
          editorHost: document.querySelector("[data-editor-host]")?.getAttribute("data-editor-host"),
          renderedRows: document.querySelectorAll("[data-node-id]").length,
          totalElements: document.querySelectorAll("*").length,
        },
      };
      } finally {
        for (const observer of observers) {
          for (const entry of observer.takeRecords()) {
            if (entry.entryType === "longtask") {
              longTasks.push(entry.duration);
            } else if (entry.entryType === "long-animation-frame") {
              const frame = entry as PerformanceEntry & { blockingDuration?: number };
              longFrames.push({ durationMs: frame.duration, blockingMs: frame.blockingDuration ?? 0 });
            }
          }
          observer.disconnect();
        }
        running = false;
      }
    },
    prepareTrusted() {
      if (running || trustedStart !== 0) {
        throw new Error("benchmark lifecycle already active");
      }
      trustedStart = performance.now();
      trustedKeys = 0;
      trustedSelections = 0;
      trustedHandlerMs = [];
      eventTiming = [];
      eventTimingSupported = false;
      trustedLongTasks = [];
      trustedLongFrames = [];
      trustedObservers = [];
      try {
        const observer = new PerformanceObserver((list) => {
          trustedLongTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        observer.observe({ type: "longtask" });
        trustedObservers.push(observer);
      } catch {
        trustedLongTasks.length = 0;
      }
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const frame = entry as PerformanceEntry & { blockingDuration?: number };
            trustedLongFrames.push({
              durationMs: frame.duration,
              blockingMs: frame.blockingDuration ?? 0,
            });
          }
        });
        observer.observe({ type: "long-animation-frame" });
        trustedObservers.push(observer);
      } catch {
        trustedLongFrames.length = 0;
      }
      try {
        eventObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const timing = entry as PerformanceEventTiming;
            if (timing.name === "keydown") {
              eventTiming.push({
                durationMs: timing.duration,
                processingMs: timing.processingEnd - timing.processingStart,
              });
            }
          }
        });
        const eventOptions = { type: "event", durationThreshold: 16 } as PerformanceObserverInit;
        eventObserver.observe(eventOptions);
        eventTimingSupported = true;
      } catch {
        eventObserver = null;
      }
      store.resetDiagnostics();
      resetLedger();
      document.querySelector<HTMLElement>("[role='tree']")?.focus();
      return { visibleRows: store.getState().visibleIds.length, anchors: createTrustedAnchors(store) };
    },
    positionTrusted(id) {
      if (trustedStart === 0) {
        throw new Error("trusted capture is not active");
      }
      flushSync(() => store.setActiveNote(id));
      const state = store.getState();
      const nextId = state.visibleIds[state.visibleIds.indexOf(id) + 1];
      if (!nextId || state.nodes.get(nextId)?.kind !== "note" || state.disabledIds.has(nextId)) {
        throw new Error("trusted anchor has no enabled note destination");
      }
      return nextId;
    },
    confirmTrusted(expectedId) {
      if (trustedStart === 0) {
        throw new Error("trusted capture is not active");
      }
      if (store.getState().activeNoteId !== expectedId) {
        throw new Error(`trusted key did not activate ${expectedId}`);
      }
      trustedSelections += 1;
    },
    async finishTrusted() {
      if (trustedStart === 0) {
        throw new Error("trusted capture is not active");
      }
      await nextFrame();
      const elapsedMs = trustedStart === 0 ? 0 : performance.now() - trustedStart;
      trustedStart = 0;
      eventObserver?.disconnect();
      eventObserver = null;
      for (const observer of trustedObservers) {
        for (const entry of observer.takeRecords()) {
          if (entry.entryType === "longtask") {
            trustedLongTasks.push(entry.duration);
          } else if (entry.entryType === "long-animation-frame") {
            const frame = entry as PerformanceEntry & { blockingDuration?: number };
            trustedLongFrames.push({
              durationMs: frame.duration,
              blockingMs: frame.blockingDuration ?? 0,
            });
          }
        }
        observer.disconnect();
      }
      trustedObservers = [];
      return {
        keydownCount: trustedKeys,
        selectionCount: trustedSelections,
        handlerThroughFrame: summarize(trustedHandlerMs),
        samplesMs: trustedHandlerMs,
        elapsedMs,
        eventTiming: {
          supported: eventTimingSupported,
          thresholdMs: 16,
          entries: eventTiming,
        },
        droppedFrames: trustedHandlerMs.filter((duration) => duration > 25).length,
        longTasks: trustedLongTasks,
        longFrames: trustedLongFrames,
        diagnostics: store.diagnostics(),
        ledger: readLedger(),
      };
    },
    galleryChecks() {
      return [
        { name: "meaningful-content", pass: document.body.innerText.includes("Skriuw selector laboratory") },
        { name: "no-overlay", pass: !document.querySelector("vite-error-overlay") },
        { name: "selected-state", pass: store.getState().activeNoteId !== null },
        { name: "disabled-state", pass: store.getState().disabledIds.size > 0 },
        { name: "reduced-motion", pass: matchMedia("(prefers-reduced-motion: reduce)").media.length > 0 },
      ];
    },
    destroy() {
      if (running || trustedStart !== 0) {
        throw new Error("cannot destroy during an active benchmark lifecycle");
      }
      window.removeEventListener("keydown", onTrustedKeyDown, { capture: true });
      store.destroy();
      return store.diagnostics().listenerCount;
    },
  };
}
