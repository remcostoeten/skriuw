import type { ProfilerOnRenderCallback } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

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

export type PhaseName =
  | "selection"
  | "working-set"
  | "keyboard"
  | "typing"
  | "link-caret"
  | "navigation-tail"
  | "save-pause"
  | "pending-save-switch"
  | "bubble-hold"
  | "sidebar-collapse"
  | "sidebar-expand"
  | "scroll";

export type PhaseResult = {
  samples: {
    dispatchMs: number[];
    editorInstallationMs: number[];
    windowGrowthMs: number[];
    nextPaintMs: number[];
    frameGapsMs: number[];
    reactCommitMs: number[];
  };
  summary: {
    dispatch: TimingSummary;
    editorInstallation: TimingSummary;
    windowGrowth: TimingSummary;
    nextPaint: TimingSummary;
    frameGaps: TimingSummary;
    reactCommit: TimingSummary;
  };
  droppedFrames: number;
  frameMisses: {
    at60Hz: number;
    at120Hz: number;
  };
  longTasks: number[];
  longAnimationFrames: LongAnimationFrameSample[];
  reactCommits: number;
  bridgeCalls: string[];
};

export type LinkCaretResult = PhaseResult & {
  expected: number;
  handled: number;
  moved: number;
  menuOpen: boolean;
};

export type FixtureContent = "plain" | "varied";

export type FixtureIdentity = {
  name: string;
  operationsDigest: string;
  nodeCount: number;
  noteCount: number;
  folderCount: number;
  blockCount: number;
  content: FixtureContent;
  contentVersion: number;
  journalEntryCount: number;
  historyHeaderCount: number;
  annotationCount: number;
  taskCount: number;
  averageDocumentJsonBytes: number | null;
  largestTagFanOut: number;
  measuredNoteIds: string[];
  workingSetNoteIds: string[];
};

export type WorkingSetResult = {
  distinctVisits: number;
  configuredLimit: number;
  maximumObservedSize: number;
  finalObservedSize: number;
  evictions: number;
  coldRevisitWasEvicted: boolean;
  coldRevisitDispatchMs: number;
  bridgeCalls: string[];
};

export type NavigationTailResult = {
  windowMs: number;
  reactCommits: number;
  bridgeCalls: string[];
  frameGapMaxMs: number;
  longTasks: number[];
  longAnimationFrames: LongAnimationFrameSample[];
  unlinkedMentionRows: number;
  idleCallbackFallback: boolean;
};

export type CorrectnessCheck = {
  name: string;
  pass: boolean;
  detail: string;
};

export type BrowserCapabilities = {
  longAnimationFrames: boolean;
  longTasks: boolean;
  idleCallbacks: boolean;
  heap: boolean;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export type SavePauseResult = PhaseResult & {
  iterations: number;
  savesObserved: number;
  saveDelayMs: number[];
  saveFrameGapMs: number[];
};

export type PendingSaveSwitchResult = PhaseResult & {
  iterations: number;
  landed: number;
  typingToPressMs: number[];
  pressToSwitchPaintMs: number[];
  savesDuringSwitch: number[];
};

export type BubbleHoldResult = PhaseResult & {
  opened: boolean;
  openMs: number | null;
  holdMs: number;
  selectedCharacters: number;
};

export type SidebarToggleResult = PhaseResult & {
  toggled: boolean;
  windowMs: number;
};

export type ScrollInput = "wheel" | "scrollBy";

export type ScrollResult = PhaseResult & {
  ticks: number;
  input: ScrollInput;
  scrolledPx: number;
  renderedBlocksAtEnd: number;
};

export type ScenarioResults = {
  savePause: SavePauseResult;
  pendingSaveSwitch: PendingSaveSwitchResult;
  bubbleHold: BubbleHoldResult;
  sidebarCollapse: SidebarToggleResult;
  sidebarExpand: SidebarToggleResult;
  scroll: ScrollResult;
  correctness: CorrectnessCheck[];
};

export type ProductRendererResult = {
  fixture: FixtureIdentity;
  capabilities: BrowserCapabilities;
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
  linkCaret: LinkCaretResult;
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
  finishKeyboard: () => Promise<
    PhaseResult & { expected: number; handled: number; selections: number }
  >;
  settleNavigation: () => Promise<NavigationTailResult>;
  prepareTyping: () => Promise<{ expected: number }>;
  confirmTyping: () => void;
  finishTyping: () => Promise<PhaseResult & { expected: number; handled: number }>;
  prepareLinkCaret: () => Promise<{ expected: number }>;
  finishLinkCaret: () => Promise<LinkCaretResult>;
  runReferenceSuggestions: () => {
    samplesMs: number[];
    p95Ms: number;
    maxMs: number;
    bridgeCalls: string[];
    tagResults: number;
    peopleResults: number;
    noteResults: number;
  };
  prepareSavePause: () => Promise<{ iterations: number; keystrokes: number }>;
  awaitSave: () => Promise<void>;
  finishSavePause: () => Promise<SavePauseResult>;
  preparePendingSwitch: (
    iteration: number,
  ) => Promise<ScreenPoint & { expectedId: string; iterations: number; keystrokes: number }>;
  confirmPendingSwitch: (expectedId: string) => Promise<void>;
  finishPendingSwitch: () => Promise<PendingSaveSwitchResult>;
  prepareBubble: () => Promise<{ expected: number }>;
  holdBubble: () => Promise<BubbleHoldResult>;
  prepareSidebarToggle: (name: "sidebar-collapse" | "sidebar-expand") => Promise<ScreenPoint>;
  settleSidebarToggle: () => Promise<SidebarToggleResult>;
  prepareScroll: (input: ScrollInput) => Promise<ScreenPoint & { ticks: number; deltaY: number }>;
  scrollStep: () => void;
  finishScroll: () => Promise<ScrollResult>;
  finishScenarios: (results: Omit<ScenarioResults, "correctness">) => ScenarioResults;
  readPageErrors: () => string[];
  finish: (
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
  ) => ProductRendererResult;
  destroy: () => void;
};

export type PerformanceWindow = Window & {
  __SKRIUW_PRODUCT_PERFORMANCE__: PerformanceController;
};
