import { flushSync } from "react-dom";
import { EditorView } from "prosemirror-view";
import type { ProfilerOnRenderCallback } from "react";
import type { RendererStore } from "../src/store/types";
import { estimateFrameDuration, nextFrame, summarize } from "./metrics";
import { readBridgeCalls, resetBridgeCalls } from "./bridge-mock";
import type {
  FixtureIdentity,
  LongAnimationFrameSample,
  PerformanceController,
  PhaseResult,
  ProductRendererResult,
} from "./types";

const SELECTION_COUNT = 100;
const TYPING_COUNT = 30;

type Phase = {
  name: "selection" | "keyboard" | "typing";
  startedAt: number;
  dispatchMs: number[];
  editorInstallationMs: number[];
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
  const frame = (timestamp: number) => {
    if (!active) {
      return;
    }
    phase.frameGapsMs.push(timestamp - previous);
    previous = timestamp;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => {
    active = false;
  };
}

function startPhase(name: Phase["name"]): Phase {
  resetBridgeCalls();
  const phase: Phase = {
    name,
    startedAt: performance.now(),
    dispatchMs: [],
    editorInstallationMs: [],
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
  const relevantLongFrames = phase.longAnimationFrames.filter(
    (entry) => entry.startTime + entry.durationMs >= phase.startedAt,
  );
  return {
    samples: {
      dispatchMs: phase.dispatchMs,
      editorInstallationMs: phase.editorInstallationMs,
      nextPaintMs: phase.nextPaintMs,
      frameGapsMs: phase.frameGapsMs,
      reactCommitMs: phase.reactCommitMs,
    },
    summary: {
      dispatch: summarize(phase.dispatchMs),
      editorInstallation: summarize(phase.editorInstallationMs),
      nextPaint: summarize(phase.nextPaintMs),
      frameGaps: summarize(phase.frameGapsMs),
      reactCommit: summarize(phase.reactCommitMs),
    },
    droppedFrames: phase.frameGapsMs.filter((sample) => sample > estimatedFrameMs * 1.5).length,
    longTasks: phase.longTasks,
    longAnimationFrames: relevantLongFrames,
    reactCommits: phase.reactCommitMs.length,
    bridgeCalls: readBridgeCalls(),
  };
}

function instrumentEditor(onInstallation: (duration: number) => void): () => void {
  const original = EditorView.prototype.updateState;
  EditorView.prototype.updateState = function updateState(state) {
    const started = performance.now();
    original.call(this, state);
    onInstallation(performance.now() - started);
  };
  return () => {
    EditorView.prototype.updateState = original;
  };
}

export async function createPerformanceController(
  store: RendererStore,
  fixture: FixtureIdentity,
): Promise<PerformanceController> {
  const estimatedFrameMs = await estimateFrameDuration();
  let phase: Phase | null = null;
  let keyboardHandled = 0;
  let keyboardSelections = 0;
  let typingHandled = 0;
  let typingPreviousText = "";
  let editorHosts = 0;
  let prosemirrorViews = 0;
  let initialEditor: Element | null = null;
  const resourceBaseline = new Set(
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  const restoreEditor = instrumentEditor((duration) => {
    phase?.editorInstallationMs.push(duration);
  });
  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        const hosts = Number(node.matches(".editor-host")) + node.querySelectorAll(".editor-host").length;
        const views = Number(node.matches(".ProseMirror")) + node.querySelectorAll(".ProseMirror").length;
        editorHosts += hosts;
        prosemirrorViews += views;
      }
    }
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

  const onRender: ProfilerOnRenderCallback = (
    _id,
    _phase,
    actualDuration,
  ) => {
    phase?.reactCommitMs.push(actualDuration);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!phase || !event.isTrusted) {
      return;
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
  };
  window.addEventListener("keydown", onKeyDown, { capture: true });

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
      flushSync(() => store.setActiveNote(id));
      phase.dispatchMs.push(performance.now() - started);
      const paintStarted = performance.now();
      await nextFrame();
      phase.nextPaintMs.push(performance.now() - paintStarted);
    }
    const completed = phase;
    phase = null;
    return stopPhase(completed, estimatedFrameMs);
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

  function finish(
    selection: PhaseResult,
    keyboardSwitches: PhaseResult & { expected: number; handled: number; selections: number },
    typing: PhaseResult & { expected: number; handled: number },
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
    const renderedTreeItems = document.querySelectorAll("[role='treeitem']").length;
    const shellHeight = document.querySelector<HTMLElement>(".shell")?.getBoundingClientRect().height;
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
        pass: mounts.editorHosts === 1 && mounts.prosemirrorViews === 1 && mounts.editorRemounts === 0,
        detail: JSON.stringify(mounts),
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
        name: "trusted-keystroke-count-is-exact",
        pass: typing.handled === TYPING_COUNT,
        detail: `${typing.handled}/${TYPING_COUNT}`,
      },
      {
        name: "large-editor-dom-is-bounded",
        pass: fixture.blockCount <= 192 || renderedEditorBlocks <= 192,
        detail: `${renderedEditorBlocks}/${fixture.blockCount} top-level blocks`,
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
      estimatedFrameMs,
      selection,
      keyboardSwitches,
      typing,
      mounts,
      dom: {
        elements: document.querySelectorAll("*").length,
        treeItems: renderedTreeItems,
        editorBlocks: document.querySelectorAll(".ProseMirror > *").length,
      },
      resourcesLoadedDuringNavigation: loadedResources,
      correctness,
    };
  }

  return {
    store,
    onRender,
    runSelection,
    alignFrame: async () => {
      await nextFrame();
    },
    prepareKeyboard,
    positionKeyboard,
    confirmKeyboard,
    finishKeyboard,
    prepareTyping,
    confirmTyping,
    finishTyping,
    finish,
    destroy: () => {
      restoreEditor();
      mutationObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      store.destroy();
    },
  };
}
