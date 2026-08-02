import type { ProfilerOnRenderCallback } from "react";
import type { RendererStore } from "../src/store/types";

export type TimingSummary = {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export type LongAnimationFrameSample = {
  startTime: number;
  durationMs: number;
  blockingDurationMs: number;
};

export type PhaseResult = {
  samples: {
    dispatchMs: number[];
    editorInstallationMs: number[];
    nextPaintMs: number[];
    frameGapsMs: number[];
    reactCommitMs: number[];
  };
  summary: {
    dispatch: TimingSummary;
    editorInstallation: TimingSummary;
    nextPaint: TimingSummary;
    frameGaps: TimingSummary;
    reactCommit: TimingSummary;
  };
  droppedFrames: number;
  longTasks: number[];
  longAnimationFrames: LongAnimationFrameSample[];
  reactCommits: number;
  bridgeCalls: string[];
};

export type FixtureIdentity = {
  name: string;
  operationsDigest: string;
  nodeCount: number;
  noteCount: number;
  folderCount: number;
  blockCount: number;
  measuredNoteIds: string[];
  workingSetNoteIds: string[];
};

export type WorkingSetResult = {
  distinctVisits: number;
  configuredLimit: number;
  maximumObservedSize: number;
  finalObservedSize: number;
  evictions: number;
  coldRevisitDispatchMs: number;
  bridgeCalls: string[];
};

export type CorrectnessCheck = {
  name: string;
  pass: boolean;
  detail: string;
};

export type ProductRendererResult = {
  fixture: FixtureIdentity;
  estimatedFrameMs: number;
  selection: PhaseResult;
  workingSet: WorkingSetResult;
  keyboardSwitches: PhaseResult & {
    expected: number;
    handled: number;
    selections: number;
  };
  typing: PhaseResult & {
    expected: number;
    handled: number;
  };
  referenceSuggestions: {
    samplesMs: number[];
    p95Ms: number;
    maxMs: number;
    bridgeCalls: string[];
    tagResults: number;
    peopleResults: number;
    noteResults: number;
  };
  mounts: {
    editorHosts: number;
    prosemirrorViews: number;
    editorRemounts: number;
  };
  dom: {
    elements: number;
    treeItems: number;
    editorBlocks: number;
  };
  resourcesLoadedDuringNavigation: string[];
  startupPreparation: StartupPreparationResult;
  correctness: CorrectnessCheck[];
};

export type StartupPreparationResult = {
  renderMs: number;
  heapBytesBefore: number | null;
  heapBytesAfter: number | null;
  documentCount: number;
  topLevelBlockCount: number;
};

export type PerformanceController = {
  store: RendererStore;
  onRender: ProfilerOnRenderCallback;
  runSelection: () => Promise<PhaseResult>;
  runWorkingSet: () => Promise<WorkingSetResult>;
  alignFrame: () => Promise<void>;
  prepareKeyboard: () => Promise<{ anchors: string[] }>;
  positionKeyboard: (id: string) => string;
  confirmKeyboard: (expectedId: string) => void;
  finishKeyboard: () => Promise<PhaseResult & { expected: number; handled: number; selections: number }>;
  prepareTyping: () => Promise<{ expected: number }>;
  confirmTyping: () => void;
  finishTyping: () => Promise<PhaseResult & { expected: number; handled: number }>;
  runReferenceSuggestions: () => {
    samplesMs: number[];
    p95Ms: number;
    maxMs: number;
    bridgeCalls: string[];
    tagResults: number;
    peopleResults: number;
    noteResults: number;
  };
  finish: (
    selection: PhaseResult,
    workingSet: WorkingSetResult,
    keyboardSwitches: PhaseResult & { expected: number; handled: number; selections: number },
    typing: PhaseResult & { expected: number; handled: number },
    referenceSuggestions: {
      samplesMs: number[];
      p95Ms: number;
      maxMs: number;
      bridgeCalls: string[];
      tagResults: number;
      peopleResults: number;
      noteResults: number;
    },
  ) => ProductRendererResult;
  destroy: () => void;
};

export type PerformanceWindow = Window & {
  __SKRIUW_PRODUCT_PERFORMANCE__: PerformanceController;
};
