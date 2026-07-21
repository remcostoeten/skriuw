export type CandidateId = "prosemirror" | "lexical";

export type RenderingStrategy = "replace" | "retained";

export type BlockCount = 50 | 500 | 2_000;

export type CanonicalBlock = {
  kind: "heading" | "paragraph" | "quote";
  text: string;
};

export type PreparedState = {
  id: string;
  value: unknown;
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
  destroy(): void;
};

export type MemoryMeasurement = {
  baselineBytes: number;
  residentBytes: number;
  deltaBytes: number;
  source: "measureUserAgentSpecificMemory";
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
