export type CandidateId = "prosemirror" | "lexical";

export type RenderingStrategy = "replace" | "retained" | "bounded";

export type BlockCount = 50 | 500 | 2_000;

export type CanonicalBlock = {
  kind: "heading" | "paragraph" | "quote";
  text: string;
};

export type PreparedState = {
  id: string;
  value: unknown;
  canonicalBlockCount?: number;
  renderedBlockCount?: number;
  windowStart?: number;
  windowEnd?: number;
};

export type BoundedSelection = {
  blockIndex: number;
  offset: number;
};

export type BoundedCanonicalEdit = {
  blockIndex: number;
  text: string;
};

export type BoundedEditorSnapshot = {
  noteId: string;
  start: number;
  end: number;
  scrollTop: number;
  selection: BoundedSelection | null;
  domSelection: BoundedSelection | null;
  selectionTop: number | null;
  focused: boolean;
  domFocused: boolean;
  renderedTexts: string[];
  canonicalTexts: string[];
  composing: boolean;
  undoDepth: number;
  slashMenuOpen: boolean;
  slashMenuQuery: string;
};

export type BoundedEditorControl = {
  snapshot(): BoundedEditorSnapshot;
  focus(selection: BoundedSelection): void;
  moveWindow(start: number): void;
  reconcileCanonical(edit: BoundedCanonicalEdit): void;
  insertText(text: string): void;
  undo(): boolean;
};

export type EditorCandidate = {
  id: CandidateId;
  label: string;
  strategy: RenderingStrategy;
  prepare(blockCount: BlockCount, noteCount: number): PreparedState[];
  mount(host: HTMLElement, states: readonly PreparedState[], initial: PreparedState): void;
  install(state: PreparedState): void;
  edit(sampleIndex: number): void;
  preparationCount(): number;
  mountCount(): number;
  editorInstanceCount(): number;
  activeDomNodeCount(): number;
  totalDomNodeCount(): number;
  layoutHeight(): number;
  boundedControl?: BoundedEditorControl;
  destroy(): void;
};

export type MemoryMeasurement = {
  baselineBytes: number;
  residentBytes: number;
  deltaBytes: number;
  source: "measureUserAgentSpecificMemory";
};

export type BlockRange = {
  start: number;
  end: number;
};

export type TimingSample = {
  index: number;
  syncMs: number;
  layoutMs: number;
  settledMs: number;
  nextFrameMs: number;
  frameGapMs: number;
};

export type TimingSummary = {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export type NativeHandlerSample = {
  index: number;
  eventTime: number;
  processingStarted: number;
  syncMs: number;
  layoutMs: number;
  settledMs: number;
};

export type EventTimingRecord = {
  name: string;
  startTime: number;
  durationMs: number;
  processingStart: number;
  processingEnd: number;
  interactionId: number;
  inputDelayMs: number;
  processingMs: number;
  quantizedPresentationDelayMs: number;
};

export type LongAnimationFrameRecord = {
  startTime: number;
  durationMs: number;
  blockingDurationMs: number;
  renderStart: number;
  styleAndLayoutStart: number;
  firstUIEventTimestamp: number;
};

export type NativeInteractionResult = {
  supported: boolean;
  expectedInteractions: number;
  handledInteractions: number;
  reportedEventEntries: number;
  reportedInteractions: number;
  unreportedEventEntries: number;
  durationThresholdMs: 16;
  handlerSamples: NativeHandlerSample[];
  entries: EventTimingRecord[];
  longAnimationFramesSupported: boolean;
  longAnimationFrames: LongAnimationFrameRecord[];
};

export type ScenarioResult = {
  samples: TimingSample[];
  sync: TimingSummary;
  layout: TimingSummary;
  settled: TimingSummary;
  nextFrame: TimingSummary;
  droppedFrames: number;
  longTasks: number;
};

export type BenchmarkResult = {
  candidate: CandidateId;
  strategy: RenderingStrategy;
  blockCount: BlockCount;
  noteCount: number;
  canonicalBlocks: number;
  renderedBlocks: number;
  windowRanges: BlockRange[] | null;
  preparationMs: number;
  mountMs: number;
  primeMs: number;
  preparationCallsBefore: number;
  preparationCallsAfter: number;
  hostMounts: number;
  editorInstances: number;
  activeDomNodes: number;
  totalDomNodes: number;
  memory: MemoryMeasurement | null;
  estimatedFrameMs: number;
  switching: ScenarioResult;
  typing: ScenarioResult;
  measuredAt: string;
  userAgent: string;
};

export type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};
