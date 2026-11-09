import { flushSync } from "react-dom";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  EDITOR_WORKING_SET_LIMIT,
  EditorWorkingSet,
} from "../src/features/editor/document/working-set";
import type { ProfilerOnRenderCallback } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { estimateFrameDuration, nextFrame, summarize } from "./metrics";
import { framesOver } from "./budgets.ts";
import { readBridgeCallTimes, readBridgeCalls, resetBridgeCalls } from "./bridge-mock";
import {
  queryMentionSuggestions,
  queryTagSuggestions,
} from "../src/features/references/suggestions/query";
import { SEARCH_DELAY_MS as UNLINKED_MENTION_SEARCH_DELAY_MS } from "../src/features/references/mentions/unlinked";
import type {
  BrowserCapabilities,
  BubbleHoldResult,
  CorrectnessCheck,
  FixtureIdentity,
  LinkCaretResult,
  LongAnimationFrameSample,
  NavigationTailResult,
  PendingSaveSwitchResult,
  PerformanceController,
  PhaseName,
  PhaseResult,
  ProductRendererResult,
  SavePauseResult,
  ScenarioResults,
  ScreenPoint,
  ScrollInput,
  ScrollResult,
  SidebarToggleResult,
  StartupPreparationResult,
  WorkingSetResult,
} from "./types";

const SELECTION_COUNT = 100;
const TYPING_COUNT = 30;
const LINK_CARET_MOVES = 6;
const NAVIGATION_SETTLE_MARGIN_MS = 100;
const SAVE_PAUSE_ITERATIONS = 3;
const SAVE_PAUSE_KEYSTROKES = 12;
const SAVE_WAIT_LIMIT_MS = 3_000;
const PENDING_SWITCH_ITERATIONS = 10;
const PENDING_SWITCH_KEYSTROKES = 5;
const BUBBLE_SELECTION_KEYS = 8;
const BUBBLE_OPEN_FRAME_LIMIT = 30;
const BUBBLE_HOLD_MS = 2_000;
const SIDEBAR_SETTLE_MS = 600;
const SCROLL_TICKS = 60;
const SCROLL_DELTA_Y = 200;
const SCROLL_SETTLE_MS = 300;
const SAVE_COMMAND = "apply_workspace_operations";

type Phase = {
  name: PhaseName;
  startedAt: number;
  frameTimes: number[];
  dispatchMs: number[];
  editorInstallationMs: number[];
  windowGrowthMs: number[];
  nextPaintMs: number[];
  frameGapsMs: number[];
  reactCommitMs: number[];
  longTasks: number[];
  longAnimationFrames: LongAnimationFrameSample[];
  observers: PerformanceObserver[];
  stopFrames: () => void;
};

function startFrameMonitor(phase: Phase): () => void {
  let active = true;
  let previous = performance.now();
  function frame(timestamp: number) {
    if (!active) {
      return;
    }
    phase.frameGapsMs.push(timestamp - previous);
    phase.frameTimes.push(timestamp);
    previous = timestamp;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => {
    active = false;
  };
}

function startPhase(name: PhaseName): Phase {
  resetBridgeCalls();
  performance.mark(`phase:${name}:start`);
  const phase: Phase = {
    name,
    startedAt: performance.now(),
    frameTimes: [],
    dispatchMs: [],
    editorInstallationMs: [],
    windowGrowthMs: [],
    nextPaintMs: [],
    frameGapsMs: [],
    reactCommitMs: [],
    longTasks: [],
    longAnimationFrames: [],
    observers: [],
    stopFrames: () => undefined,
  };
  phase.stopFrames = startFrameMonitor(phase);
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    const observer = new PerformanceObserver((list) => {
      phase.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ type: "longtask" });
    phase.observers.push(observer);
  }
  if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const frame = entry as PerformanceEntry & { blockingDuration?: number };
        phase.longAnimationFrames.push({
          startTime: frame.startTime,
          durationMs: frame.duration,
          blockingDurationMs: frame.blockingDuration ?? 0,
        });
      }
    });
    observer.observe({ type: "long-animation-frame" });
    phase.observers.push(observer);
  }
  return phase;
}

async function stopPhase(phase: Phase, estimatedFrameMs: number): Promise<PhaseResult> {
  await nextFrame();
  for (const observer of phase.observers) {
    observer.takeRecords();
    observer.disconnect();
  }
  phase.stopFrames();
  performance.mark(`phase:${phase.name}:end`);
  const relevantLongFrames = phase.longAnimationFrames.filter(
    (entry) => entry.startTime + entry.durationMs >= phase.startedAt,
  );
  return {
    samples: {
      dispatchMs: phase.dispatchMs,
      editorInstallationMs: phase.editorInstallationMs,
      windowGrowthMs: phase.windowGrowthMs,
      nextPaintMs: phase.nextPaintMs,
      frameGapsMs: phase.frameGapsMs,
      reactCommitMs: phase.reactCommitMs,
    },
    summary: {
      dispatch: summarize(phase.dispatchMs),
      editorInstallation: summarize(phase.editorInstallationMs),
      windowGrowth: summarize(phase.windowGrowthMs),
      nextPaint: summarize(phase.nextPaintMs),
      frameGaps: summarize(phase.frameGapsMs),
      reactCommit: summarize(phase.reactCommitMs),
    },
    droppedFrames: phase.frameGapsMs.filter((sample) => sample > estimatedFrameMs * 1.5).length,
    frameMisses: {
      at60Hz: framesOver(phase.frameGapsMs, 16.67),
      at120Hz: framesOver(phase.frameGapsMs, 8.33),
    },
    longTasks: phase.longTasks,
    longAnimationFrames: relevantLongFrames,
    reactCommits: phase.reactCommitMs.length,
    bridgeCalls: readBridgeCalls(),
  };
}

function instrumentEditor(
  onInstallation: (view: EditorView, duration: number) => void,
): () => void {
  const original = EditorView.prototype.updateState;
  EditorView.prototype.updateState = function updateState(state) {
    const started = performance.now();
    original.call(this, state);
    onInstallation(this, performance.now() - started);
  };
  return () => {
    EditorView.prototype.updateState = original;
  };
}

function firstLinkPosition(view: EditorView): number | null {
  const linkMark = view.state.schema.marks.link;
  const found: number[] = [];
  view.state.doc.descendants((node, position) => {
    if (found.length > 0) return false;
    if (node.isText && node.marks.some((mark) => mark.type === linkMark)) {
      found.push(position + 1);
    }
    return found.length === 0;
  });
  return found[0] ?? null;
}

function instrumentWorkingSet(
  onPrune: (size: number, evictedIds: readonly string[]) => void,
): () => void {
  const original = EditorWorkingSet.prototype.prune;
  EditorWorkingSet.prototype.prune = function prune(protectedKeys) {
    const evicted = original.call(this, protectedKeys);
    onPrune(this.size, evicted);
    return evicted;
  };
  return () => {
    EditorWorkingSet.prototype.prune = original;
  };
}

export async function createPerformanceController(
  store: RendererStore,
  fixture: FixtureIdentity,
  startupPreparation: StartupPreparationResult,
  readPageErrors: () => string[],
): Promise<PerformanceController> {
  const estimatedFrameMs = await estimateFrameDuration();
  const memory = performance as Performance & { memory?: unknown };
  const capabilities: BrowserCapabilities = {
    longAnimationFrames: PerformanceObserver.supportedEntryTypes.includes("long-animation-frame"),
    longTasks: PerformanceObserver.supportedEntryTypes.includes("longtask"),
    idleCallbacks: "requestIdleCallback" in window,
    heap: memory.memory !== undefined,
  };
  let lastTrustedKeyAt = 0;
  let firstSelectionKeyAt: number | null = null;
  let pressAt: number | null = null;
  let sidebarExpandedBefore: string | null = null;
  const savePause = {
    savesObserved: 0,
    saveDelayMs: [] as number[],
    saveFrameGapMs: [] as number[],
  };
  const pendingSwitch = {
    landed: 0,
    typingToPressMs: [] as number[],
    pressToSwitchPaintMs: [] as number[],
    savesDuringSwitch: [] as number[],
    savesBefore: 0,
  };
  let scenarioBaseline: {
    editorHosts: number;
    prosemirrorViews: number;
    resources: Set<string>;
  } | null = null;
  let phase: Phase | null = null;
  let keyboardHandled = 0;
  let keyboardSelections = 0;
  let typingHandled = 0;
  let linkCaretHandled = 0;
  let linkCaretStart = 0;
  const editorViews = new Set<EditorView>();
  let navigationTailCommits: number | null = null;
  let typingPreviousText = "";
  let editorHosts = 0;
  let prosemirrorViews = 0;
  let selectionDispatching = false;
  let initialEditor: Element | null = null;
  let maximumWorkingSetSize = 0;
  let finalWorkingSetSize = 0;
  let workingSetEvictions = 0;
  const evictedWorkingSetIds = new Set<string>();
  const resourceBaseline = new Set(
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  const restoreEditor = instrumentEditor((view, duration) => {
    editorViews.add(view);
    if (phase?.name === "selection" && !selectionDispatching) {
      phase.windowGrowthMs.push(duration);
    } else {
      phase?.editorInstallationMs.push(duration);
    }
  });
  const restoreWorkingSet = instrumentWorkingSet((size, evictedIds) => {
    maximumWorkingSetSize = Math.max(maximumWorkingSetSize, size);
    finalWorkingSetSize = size;
    workingSetEvictions += evictedIds.length;
    for (const noteId of evictedIds) evictedWorkingSetIds.add(noteId);
  });
  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        const hosts =
          Number(node.matches(".editor-host")) + node.querySelectorAll(".editor-host").length;
        const views =
          Number(node.matches(".ProseMirror")) + node.querySelectorAll(".ProseMirror").length;
        editorHosts += hosts;
        prosemirrorViews += views;
      }
    }
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    phase?.reactCommitMs.push(actualDuration);
    if (navigationTailCommits !== null) {
      navigationTailCommits += 1;
    }
  };

  function onKeyDown(event: KeyboardEvent) {
    if (!event.isTrusted) {
      return;
    }
    lastTrustedKeyAt = event.timeStamp;
    if (!phase) {
      return;
    }
    if (
      (phase.name === "save-pause" || phase.name === "pending-save-switch") &&
      event.key.length === 1
    ) {
      const started = event.timeStamp;
      requestAnimationFrame((paintedAt) => phase?.nextPaintMs.push(paintedAt - started));
    }
    if (
      phase.name === "bubble-hold" &&
      event.key === "ArrowRight" &&
      firstSelectionKeyAt === null
    ) {
      firstSelectionKeyAt = event.timeStamp;
    }
    if (phase.name === "keyboard" && event.key === "Enter") {
      const started = event.timeStamp;
      keyboardHandled += 1;
      requestAnimationFrame((paintedAt) => phase?.nextPaintMs.push(paintedAt - started));
    }
    if (phase.name === "typing" && event.key.length === 1) {
      const started = event.timeStamp;
      typingHandled += 1;
      requestAnimationFrame((paintedAt) => phase?.nextPaintMs.push(paintedAt - started));
    }
    if (phase.name === "link-caret" && event.key === "ArrowRight") {
      const started = event.timeStamp;
      linkCaretHandled += 1;
      requestAnimationFrame((paintedAt) => phase?.nextPaintMs.push(paintedAt - started));
    }
  }
  window.addEventListener("keydown", onKeyDown, { capture: true });

  function onMouseDown(event: MouseEvent) {
    if (event.isTrusted && phase?.name === "pending-save-switch") {
      pressAt = event.timeStamp;
      pendingSwitch.typingToPressMs.push(event.timeStamp - lastTrustedKeyAt);
    }
  }

  function onClick(event: MouseEvent) {
    if (!event.isTrusted || phase?.name !== "pending-save-switch" || pressAt === null) {
      return;
    }
    const pressedAt = pressAt;
    const clickedAt = event.timeStamp;
    pressAt = null;
    requestAnimationFrame((paintedAt) => {
      phase?.nextPaintMs.push(paintedAt - clickedAt);
      pendingSwitch.pressToSwitchPaintMs.push(paintedAt - pressedAt);
    });
  }
  window.addEventListener("mousedown", onMouseDown, { capture: true });
  window.addEventListener("click", onClick, { capture: true });

  await nextFrame();
  await nextFrame();
  initialEditor = document.querySelector(".ProseMirror");
  editorHosts = document.querySelectorAll(".editor-host").length;
  prosemirrorViews = document.querySelectorAll(".ProseMirror").length;

  async function runSelection(): Promise<PhaseResult> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    for (const id of fixture.measuredNoteIds) {
      flushSync(() => store.setActiveNote(id));
      await nextFrame();
    }
    phase = startPhase("selection");
    for (let index = 0; index < SELECTION_COUNT; index += 1) {
      await nextFrame();
      const id = fixture.measuredNoteIds[(index + 1) % fixture.measuredNoteIds.length];
      if (!id) {
        throw new Error("missing measured note");
      }
      const started = performance.now();
      selectionDispatching = true;
      flushSync(() => store.setActiveNote(id));
      selectionDispatching = false;
      phase.dispatchMs.push(performance.now() - started);
      const paintStarted = performance.now();
      await nextFrame();
      phase.nextPaintMs.push(performance.now() - paintStarted);
    }
    const completed = phase;
    phase = null;
    return stopPhase(completed, estimatedFrameMs);
  }

  async function runWorkingSet(): Promise<WorkingSetResult> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    if (fixture.workingSetNoteIds.length !== 100) {
      throw new Error("working-set measurement requires one hundred distinct notes");
    }
    maximumWorkingSetSize = 0;
    finalWorkingSetSize = 0;
    workingSetEvictions = 0;
    evictedWorkingSetIds.clear();
    phase = startPhase("working-set");
    for (const id of fixture.workingSetNoteIds) {
      flushSync(() => store.setActiveNote(id));
      await nextFrame();
    }
    const revisitId = fixture.workingSetNoteIds[0];
    if (!revisitId) throw new Error("missing working-set revisit note");
    const started = performance.now();
    flushSync(() => store.setActiveNote(revisitId));
    const coldRevisitDispatchMs = performance.now() - started;
    await nextFrame();
    const completed = phase;
    phase = null;
    const result = await stopPhase(completed, estimatedFrameMs);
    return {
      distinctVisits: fixture.workingSetNoteIds.length,
      configuredLimit: EDITOR_WORKING_SET_LIMIT,
      maximumObservedSize: maximumWorkingSetSize,
      finalObservedSize: finalWorkingSetSize,
      evictions: workingSetEvictions,
      coldRevisitWasEvicted: evictedWorkingSetIds.has(revisitId),
      coldRevisitDispatchMs,
      bridgeCalls: result.bridgeCalls,
    };
  }

  async function prepareKeyboard(): Promise<{ anchors: string[] }> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    keyboardHandled = 0;
    keyboardSelections = 0;
    phase = startPhase("keyboard");
    document.querySelector<HTMLElement>("[role='tree']")?.focus();
    await nextFrame();
    return {
      anchors: Array.from(
        { length: SELECTION_COUNT },
        (_, index) => fixture.measuredNoteIds[index % fixture.measuredNoteIds.length] ?? "",
      ),
    };
  }

  function positionKeyboard(id: string): string {
    if (phase?.name !== "keyboard") {
      throw new Error("keyboard phase is not active");
    }
    store.setFocusedNode(id);
    document.querySelector<HTMLElement>("[role='tree']")?.focus();
    return id;
  }

  function confirmKeyboard(expectedId: string): void {
    if (phase?.name !== "keyboard") {
      throw new Error("keyboard phase is not active");
    }
    if (store.getState().activeNoteId !== expectedId) {
      throw new Error(`keyboard selected ${store.getState().activeNoteId}, expected ${expectedId}`);
    }
    keyboardSelections += 1;
  }

  async function finishKeyboard() {
    if (phase?.name !== "keyboard") {
      throw new Error("keyboard phase is not active");
    }
    const completed = phase;
    phase = null;
    return {
      ...(await stopPhase(completed, estimatedFrameMs)),
      expected: SELECTION_COUNT,
      handled: keyboardHandled,
      selections: keyboardSelections,
    };
  }

  function waitFor(milliseconds: number): Promise<void> {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
  }

  function waitForIdle(): Promise<void> {
    if (capabilities.idleCallbacks) {
      return new Promise((resolveIdle) =>
        requestIdleCallback(() => resolveIdle(), { timeout: 1_000 }),
      );
    }
    return waitFor(50);
  }

  async function settleNavigation(): Promise<NavigationTailResult> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    navigationTailCommits = 0;
    phase = startPhase("navigation-tail");
    const startedAt = performance.now();
    await waitFor(UNLINKED_MENTION_SEARCH_DELAY_MS + NAVIGATION_SETTLE_MARGIN_MS);
    await waitForIdle();
    await nextFrame();
    await nextFrame();
    const reactCommits = navigationTailCommits;
    navigationTailCommits = null;
    const windowMs = performance.now() - startedAt;
    const completed = phase;
    phase = null;
    const result = await stopPhase(completed, estimatedFrameMs);
    return {
      windowMs,
      reactCommits,
      bridgeCalls: result.bridgeCalls,
      frameGapMaxMs: result.summary.frameGaps.maxMs,
      longTasks: result.longTasks,
      longAnimationFrames: result.longAnimationFrames,
      unlinkedMentionRows: document.querySelectorAll("[data-unlinked-mention]").length,
      idleCallbackFallback: !capabilities.idleCallbacks,
    };
  }

  async function prepareTyping(): Promise<{ expected: number }> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    typingHandled = 0;
    const editor = document.querySelector<HTMLElement>(".ProseMirror");
    typingPreviousText = editor?.textContent ?? "";
    editor?.focus();
    await nextFrame();
    await nextFrame();
    phase = startPhase("typing");
    return { expected: TYPING_COUNT };
  }

  function confirmTyping(): void {
    if (phase?.name !== "typing") {
      throw new Error("typing phase is not active");
    }
    const text = document.querySelector(".ProseMirror")?.textContent ?? "";
    if (text === typingPreviousText) {
      throw new Error("trusted typing did not update the editor");
    }
    typingPreviousText = text;
  }

  async function finishTyping() {
    if (phase?.name !== "typing") {
      throw new Error("typing phase is not active");
    }
    const completed = phase;
    phase = null;
    return {
      ...(await stopPhase(completed, estimatedFrameMs)),
      expected: TYPING_COUNT,
      handled: typingHandled,
    };
  }

  function activeEditorView(): EditorView {
    const dom = document.querySelector(".ProseMirror");
    for (const view of editorViews) {
      if (view.dom === dom) return view;
    }
    throw new Error("no editor view owns the mounted editor");
  }

  async function prepareLinkCaret(): Promise<{ expected: number }> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    linkCaretHandled = 0;
    const view = activeEditorView();
    const target = firstLinkPosition(view);
    if (target === null) {
      throw new Error("the measured note has no link in the mounted window");
    }
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)));
    await nextFrame();
    await nextFrame();
    if (!document.querySelector(".link-menu")) {
      throw new Error("a caret inside the link did not open the link menu");
    }
    linkCaretStart = view.state.selection.from;
    phase = startPhase("link-caret");
    return { expected: LINK_CARET_MOVES };
  }

  async function finishLinkCaret() {
    if (phase?.name !== "link-caret") {
      throw new Error("link caret phase is not active");
    }
    const completed = phase;
    phase = null;
    const view = activeEditorView();
    return {
      ...(await stopPhase(completed, estimatedFrameMs)),
      expected: LINK_CARET_MOVES,
      handled: linkCaretHandled,
      moved: view.state.selection.from - linkCaretStart,
      menuOpen: document.querySelector(".link-menu") !== null,
    };
  }

  function runReferenceSuggestions() {
    resetBridgeCalls();
    const samplesMs: number[] = [];
    let tagResults = 0;
    let peopleResults = 0;
    let noteResults = 0;
    for (let round = 0; round < 20; round += 1) {
      for (const query of ["", "performance", "performance tag 0999", "missing"]) {
        const started = performance.now();
        tagResults += queryTagSuggestions(store.getState(), query).length;
        const mentions = queryMentionSuggestions(store.getState(), query);
        peopleResults += mentions.people.length;
        noteResults += mentions.notes.length;
        samplesMs.push(performance.now() - started);
      }
    }
    const summary = summarize(samplesMs);
    return {
      samplesMs,
      p95Ms: summary.p95Ms,
      maxMs: summary.maxMs,
      bridgeCalls: readBridgeCalls(),
      tagResults,
      peopleResults,
      noteResults,
    };
  }

  function requirePhase(name: PhaseName): Phase {
    if (phase?.name !== name) {
      throw new Error(`${name} phase is not active`);
    }
    return phase;
  }

  async function endPhase(name: PhaseName): Promise<PhaseResult> {
    const completed = requirePhase(name);
    phase = null;
    return stopPhase(completed, estimatedFrameMs);
  }

  function center(element: Element): ScreenPoint {
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }

  function visible(selector: string): HTMLElement | null {
    return (
      [...document.querySelectorAll<HTMLElement>(selector)].find(
        (element) => element.getClientRects().length > 0,
      ) ?? null
    );
  }

  async function focusEditorAt(position: "start" | "end"): Promise<EditorView> {
    const view = activeEditorView();
    const firstBlock = view.state.doc.firstChild;
    const target = position === "start" || !firstBlock ? 1 : firstBlock.nodeSize - 1;
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)));
    await nextFrame();
    await nextFrame();
    return view;
  }

  function startScenarios(): void {
    if (scenarioBaseline !== null) return;
    scenarioBaseline = {
      editorHosts,
      prosemirrorViews,
      resources: new Set(performance.getEntriesByType("resource").map((entry) => entry.name)),
    };
  }

  async function prepareSavePause() {
    if (phase) {
      throw new Error("performance phase already active");
    }
    startScenarios();
    savePause.savesObserved = 0;
    savePause.saveDelayMs.length = 0;
    savePause.saveFrameGapMs.length = 0;
    await focusEditorAt("end");
    phase = startPhase("save-pause");
    return { iterations: SAVE_PAUSE_ITERATIONS, keystrokes: SAVE_PAUSE_KEYSTROKES };
  }

  async function awaitSave(): Promise<void> {
    const active = requirePhase("save-pause");
    const savesBefore = readBridgeCallTimes(SAVE_COMMAND).length;
    const typedAt = lastTrustedKeyAt;
    const deadline = performance.now() + SAVE_WAIT_LIMIT_MS;
    while (readBridgeCallTimes(SAVE_COMMAND).length === savesBefore) {
      if (performance.now() > deadline) {
        return;
      }
      await nextFrame();
    }
    const savedAt = readBridgeCallTimes(SAVE_COMMAND)[savesBefore] ?? typedAt;
    savePause.savesObserved += 1;
    savePause.saveDelayMs.push(savedAt - typedAt);
    await nextFrame();
    await nextFrame();
    const frameIndex = active.frameTimes.findIndex((time) => time >= savedAt);
    if (frameIndex > 0) {
      savePause.saveFrameGapMs.push(
        (active.frameTimes[frameIndex] ?? 0) - (active.frameTimes[frameIndex - 1] ?? 0),
      );
    }
  }

  async function finishSavePause(): Promise<SavePauseResult> {
    return {
      ...(await endPhase("save-pause")),
      iterations: SAVE_PAUSE_ITERATIONS,
      savesObserved: savePause.savesObserved,
      saveDelayMs: [...savePause.saveDelayMs],
      saveFrameGapMs: [...savePause.saveFrameGapMs],
    };
  }

  async function preparePendingSwitch(iteration: number) {
    if (iteration === 0) {
      if (phase) {
        throw new Error("performance phase already active");
      }
      startScenarios();
      pendingSwitch.landed = 0;
      pendingSwitch.typingToPressMs.length = 0;
      pendingSwitch.pressToSwitchPaintMs.length = 0;
      pendingSwitch.savesDuringSwitch.length = 0;
      await focusEditorAt("end");
      phase = startPhase("pending-save-switch");
    } else {
      requirePhase("pending-save-switch");
      await focusEditorAt("end");
    }
    const ids = fixture.measuredNoteIds;
    const current = ids.indexOf(store.getState().activeNoteId ?? "");
    const expectedId = ids[(current + 1) % ids.length] ?? "";
    const row = document.getElementById(`treeitem-${expectedId}`);
    if (!row) {
      throw new Error(`tree item for ${expectedId} is not rendered`);
    }
    pendingSwitch.savesBefore = readBridgeCallTimes(SAVE_COMMAND).length;
    return {
      ...center(row),
      expectedId,
      iterations: PENDING_SWITCH_ITERATIONS,
      keystrokes: PENDING_SWITCH_KEYSTROKES,
    };
  }

  async function confirmPendingSwitch(expectedId: string): Promise<void> {
    requirePhase("pending-save-switch");
    await nextFrame();
    await nextFrame();
    if (store.getState().activeNoteId === expectedId) {
      pendingSwitch.landed += 1;
    }
    pendingSwitch.savesDuringSwitch.push(
      readBridgeCallTimes(SAVE_COMMAND).length - pendingSwitch.savesBefore,
    );
  }

  async function finishPendingSwitch(): Promise<PendingSaveSwitchResult> {
    return {
      ...(await endPhase("pending-save-switch")),
      iterations: PENDING_SWITCH_ITERATIONS,
      landed: pendingSwitch.landed,
      typingToPressMs: [...pendingSwitch.typingToPressMs],
      pressToSwitchPaintMs: [...pendingSwitch.pressToSwitchPaintMs],
      savesDuringSwitch: [...pendingSwitch.savesDuringSwitch],
    };
  }

  async function prepareBubble(): Promise<{ expected: number }> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    startScenarios();
    await focusEditorAt("start");
    firstSelectionKeyAt = null;
    phase = startPhase("bubble-hold");
    return { expected: BUBBLE_SELECTION_KEYS };
  }

  async function holdBubble(): Promise<BubbleHoldResult> {
    requirePhase("bubble-hold");
    let openedAt: number | null = null;
    for (let frame = 0; frame < BUBBLE_OPEN_FRAME_LIMIT && openedAt === null; frame += 1) {
      const paintedAt = await nextFrame();
      if (visible(".bubble-menu")) openedAt = paintedAt;
    }
    const opening = await endPhase("bubble-hold");
    const view = activeEditorView();
    const selectedCharacters = view.state.selection.to - view.state.selection.from;
    phase = startPhase("bubble-hold");
    const holdStarted = performance.now();
    await waitFor(BUBBLE_HOLD_MS);
    const holdMs = performance.now() - holdStarted;
    const held = await endPhase("bubble-hold");
    const stillOpen = visible(".bubble-menu") !== null;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.from)),
    );
    await nextFrame();
    await nextFrame();
    return {
      ...held,
      opened: openedAt !== null && stillOpen,
      openMs:
        openedAt === null || firstSelectionKeyAt === null ? null : openedAt - firstSelectionKeyAt,
      holdMs,
      selectedCharacters,
      longAnimationFrames: [...opening.longAnimationFrames, ...held.longAnimationFrames],
      longTasks: [...opening.longTasks, ...held.longTasks],
    };
  }

  async function prepareSidebarToggle(
    name: "sidebar-collapse" | "sidebar-expand",
  ): Promise<ScreenPoint> {
    if (phase) {
      throw new Error("performance phase already active");
    }
    startScenarios();
    const button = visible("button[aria-label='Toggle sidebar']");
    if (!button) {
      throw new Error("no visible sidebar toggle");
    }
    sidebarExpandedBefore = button.getAttribute("aria-expanded");
    phase = startPhase(name);
    return center(button);
  }

  async function settleSidebarToggle(): Promise<SidebarToggleResult> {
    if (phase?.name !== "sidebar-collapse" && phase?.name !== "sidebar-expand") {
      throw new Error("sidebar phase is not active");
    }
    const name = phase.name;
    const started = performance.now();
    await waitFor(SIDEBAR_SETTLE_MS);
    const windowMs = performance.now() - started;
    const result = await endPhase(name);
    const expanded = visible("button[aria-label='Toggle sidebar']")?.getAttribute("aria-expanded");
    return { ...result, toggled: expanded !== sidebarExpandedBefore, windowMs };
  }

  let scrollInput: ScrollInput = "wheel";

  function scrollStep(): void {
    requirePhase("scroll");
    document.querySelector<HTMLElement>(".editor-scroll")?.scrollBy(0, SCROLL_DELTA_Y);
  }

  async function prepareScroll(input: ScrollInput) {
    if (phase) {
      throw new Error("performance phase already active");
    }
    startScenarios();
    const host = document.querySelector<HTMLElement>(".editor-scroll");
    if (!host) {
      throw new Error("no editor scroll host");
    }
    host.scrollTop = 0;
    scrollInput = input;
    await nextFrame();
    await nextFrame();
    phase = startPhase("scroll");
    return { ...center(host), ticks: SCROLL_TICKS, deltaY: SCROLL_DELTA_Y };
  }

  async function finishScroll(): Promise<ScrollResult> {
    requirePhase("scroll");
    await waitFor(SCROLL_SETTLE_MS);
    const result = await endPhase("scroll");
    return {
      ...result,
      ticks: SCROLL_TICKS,
      input: scrollInput,
      scrolledPx: document.querySelector<HTMLElement>(".editor-scroll")?.scrollTop ?? 0,
      renderedBlocksAtEnd: document.querySelector(".ProseMirror")?.children.length ?? 0,
    };
  }

  function finishScenarios(results: Omit<ScenarioResults, "correctness">): ScenarioResults {
    const baseline = scenarioBaseline;
    const loaded = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => !baseline?.resources.has(name));
    const {
      savePause: save,
      pendingSaveSwitch,
      bubbleHold,
      sidebarCollapse,
      sidebarExpand,
    } = results;
    const correctness: CorrectnessCheck[] = [
      {
        name: "save-pause-saves-after-debounce",
        pass: save.savesObserved === save.iterations,
        detail: `${save.savesObserved}/${save.iterations} saves, delays ${save.saveDelayMs.map((value) => value.toFixed(0)).join(", ")} ms`,
      },
      {
        name: "pending-save-switches-land",
        pass: pendingSaveSwitch.landed === pendingSaveSwitch.iterations,
        detail: `${pendingSaveSwitch.landed}/${pendingSaveSwitch.iterations}`,
      },
      {
        name: "selection-opens-bubble-menu",
        pass: bubbleHold.opened && bubbleHold.selectedCharacters === BUBBLE_SELECTION_KEYS,
        detail: `opened ${bubbleHold.opened}, ${bubbleHold.selectedCharacters} characters selected`,
      },
      {
        name: "sidebar-toggles-both-ways",
        pass: sidebarCollapse.toggled && sidebarExpand.toggled,
        detail: `collapse ${sidebarCollapse.toggled}, expand ${sidebarExpand.toggled}`,
      },
      {
        name: "scenarios-keep-editor-mounted",
        pass:
          baseline !== null &&
          editorHosts === baseline.editorHosts &&
          prosemirrorViews === baseline.prosemirrorViews,
        detail: `${editorHosts} hosts, ${prosemirrorViews} views`,
      },
      {
        name: "scenarios-load-no-resources",
        pass: loaded.length === 0,
        detail: JSON.stringify(loaded),
      },
    ];
    return { ...results, correctness };
  }

  function finish(
    selection: PhaseResult,
    workingSet: WorkingSetResult,
    keyboardSwitches: PhaseResult & { expected: number; handled: number; selections: number },
    typing: PhaseResult & { expected: number; handled: number },
    linkCaret: LinkCaretResult,
    referenceSuggestions: {
      samplesMs: number[];
      p95Ms: number;
      maxMs: number;
      bridgeCalls: string[];
      tagResults: number;
      peopleResults: number;
      noteResults: number;
    },
  ): ProductRendererResult {
    const editor = document.querySelector(".ProseMirror");
    const loadedResources = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => !resourceBaseline.has(name));
    const mounts = {
      editorHosts,
      prosemirrorViews,
      editorRemounts: editor === initialEditor ? 0 : 1,
    };
    const renderedEditorBlocks = editor?.children.length ?? 0;
    const renderedBlockNumbers = Array.from(editor?.children ?? [], (child) =>
      Number(/Block (\d+) in/.exec(child.textContent ?? "")?.[1] ?? Number.NaN),
    );
    const renderedBlocksAreConsecutive = renderedBlockNumbers.every(
      (blockNumber, index) =>
        index === 0 || blockNumber === (renderedBlockNumbers[index - 1] ?? 0) + 1,
    );
    const renderedTreeItems = document.querySelectorAll("[role='treeitem']").length;
    const shellHeight = document
      .querySelector<HTMLElement>("#root > div")
      ?.getBoundingClientRect().height;
    const boundedReader = document.querySelector("#bounded-editor-full-document");
    const correctness = [
      {
        name: "navigation-has-zero-bridge-calls",
        pass: keyboardSwitches.bridgeCalls.length === 0,
        detail: JSON.stringify(keyboardSwitches.bridgeCalls),
      },
      {
        name: "navigation-loads-no-resources",
        pass: loadedResources.length === 0,
        detail: JSON.stringify(loadedResources),
      },
      {
        name: "editor-host-and-view-stay-mounted",
        pass:
          mounts.editorHosts === 1 && mounts.prosemirrorViews === 1 && mounts.editorRemounts === 0,
        detail: JSON.stringify(mounts),
      },
      {
        name: "editor-working-set-is-bounded",
        pass:
          workingSet.distinctVisits >= 100 &&
          workingSet.maximumObservedSize <= workingSet.configuredLimit &&
          workingSet.finalObservedSize <= workingSet.configuredLimit &&
          workingSet.evictions > 0 &&
          workingSet.coldRevisitWasEvicted &&
          workingSet.bridgeCalls.length === 0,
        detail: JSON.stringify(workingSet),
      },
      {
        name: "keyboard-switch-count-is-exact",
        pass:
          keyboardSwitches.handled === SELECTION_COUNT &&
          keyboardSwitches.selections === SELECTION_COUNT,
        detail: `${keyboardSwitches.handled}/${keyboardSwitches.selections}`,
      },
      {
        name: "editor-keystrokes-skip-react",
        pass: typing.reactCommits === 0,
        detail: `${typing.reactCommits} React commits`,
      },
      {
        name: "link-caret-moves-skip-react",
        pass:
          linkCaret.reactCommits <= 1 &&
          linkCaret.handled === LINK_CARET_MOVES &&
          linkCaret.moved === LINK_CARET_MOVES &&
          linkCaret.menuOpen,
        detail: `${linkCaret.reactCommits} React commits, ${linkCaret.handled}/${LINK_CARET_MOVES} keys, moved ${linkCaret.moved}, menu ${linkCaret.menuOpen ? "open" : "closed"}`,
      },
      {
        name: "trusted-keystroke-count-is-exact",
        pass: typing.handled === TYPING_COUNT,
        detail: `${typing.handled}/${TYPING_COUNT}`,
      },
      {
        name: "reference-suggestions-stay-local-and-bounded",
        pass:
          referenceSuggestions.p95Ms < 8 &&
          referenceSuggestions.maxMs < 16.67 &&
          referenceSuggestions.bridgeCalls.length === 0 &&
          referenceSuggestions.tagResults > 0 &&
          referenceSuggestions.peopleResults > 0 &&
          referenceSuggestions.noteResults > 0,
        detail: JSON.stringify(referenceSuggestions),
      },
      {
        name: "large-editor-dom-is-bounded",
        pass: fixture.blockCount <= 192 || renderedEditorBlocks <= 192,
        detail: `${renderedEditorBlocks}/${fixture.blockCount} top-level blocks`,
      },
      {
        name: "large-editor-window-grows-to-full",
        pass:
          fixture.blockCount <= 192 ||
          (renderedEditorBlocks === 192 && renderedBlocksAreConsecutive),
        detail: `${renderedEditorBlocks} blocks, first ${renderedBlockNumbers[0]}, last ${renderedBlockNumbers.at(-1)}, consecutive ${renderedBlocksAreConsecutive}`,
      },
      {
        name: "large-editor-has-whole-document-reader",
        pass: fixture.blockCount <= 192 || boundedReader instanceof HTMLTextAreaElement,
        detail: boundedReader?.getAttribute("aria-label") ?? "missing",
      },
      {
        name: "workspace-tree-dom-is-bounded",
        pass: renderedTreeItems <= 40,
        detail: `${renderedTreeItems}/${fixture.nodeCount} tree items`,
      },
      {
        name: "workspace-shell-height-is-bounded",
        pass: shellHeight !== undefined && shellHeight <= window.innerHeight + 1,
        detail: `${shellHeight ?? "missing"}/${window.innerHeight} CSS pixels`,
      },
    ];
    return {
      fixture,
      capabilities,
      estimatedFrameMs,
      selection,
      workingSet,
      keyboardSwitches,
      typing,
      linkCaret,
      referenceSuggestions,
      mounts,
      dom: {
        elements: document.querySelectorAll("*").length,
        treeItems: renderedTreeItems,
        editorBlocks: document.querySelectorAll(".ProseMirror > *").length,
      },
      resourcesLoadedDuringNavigation: loadedResources,
      startupPreparation,
      correctness,
    };
  }

  return {
    store,
    onRender,
    runSelection,
    runWorkingSet,
    alignFrame: async () => {
      await nextFrame();
    },
    prepareKeyboard,
    positionKeyboard,
    confirmKeyboard,
    finishKeyboard,
    settleNavigation,
    prepareTyping,
    confirmTyping,
    finishTyping,
    prepareLinkCaret,
    finishLinkCaret,
    runReferenceSuggestions,
    prepareSavePause,
    awaitSave,
    finishSavePause,
    preparePendingSwitch,
    confirmPendingSwitch,
    finishPendingSwitch,
    prepareBubble,
    holdBubble,
    prepareSidebarToggle,
    settleSidebarToggle,
    prepareScroll,
    scrollStep,
    finishScroll,
    finishScenarios,
    readPageErrors,
    finish,
    destroy: () => {
      restoreEditor();
      restoreWorkingSet();
      mutationObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("mousedown", onMouseDown, { capture: true });
      window.removeEventListener("click", onClick, { capture: true });
      store.destroy();
    },
  };
}
