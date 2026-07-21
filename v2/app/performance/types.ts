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
  keyboardSwitches: PhaseResult & {
    expected: number;
    handled: number;
    selections: number;
  };
  typing: PhaseResult & {
    expected: number;
    handled: number;
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
  correctness: CorrectnessCheck[];
};

export type PerformanceController = {
  store: RendererStore;
  onRender: ProfilerOnRenderCallback;
  runSelection: () => Promise<PhaseResult>;
  alignFrame: () => Promise<void>;
  prepareKeyboard: () => Promise<{ anchors: string[] }>;
  positionKeyboard: (id: string) => string;
  confirmKeyboard: (expectedId: string) => void;
  finishKeyboard: () => Promise<PhaseResult & { expected: number; handled: number; selections: number }>;
  prepareTyping: () => Promise<{ expected: number }>;
  confirmTyping: () => void;
  finishTyping: () => Promise<PhaseResult & { expected: number; handled: number }>;
  finish: (
    selection: PhaseResult,
    keyboardSwitches: PhaseResult & { expected: number; handled: number; selections: number },
    typing: PhaseResult & { expected: number; handled: number },
  ) => ProductRendererResult;
  destroy: () => void;
};

export type PerformanceWindow = Window & {
  __SKRIUW_PRODUCT_PERFORMANCE__: PerformanceController;
};
