export type NodeKind = "folder" | "note";

export type TreeShape = "wide" | "nested" | "mixed";

export type ProjectedNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
};

export type SearchExpectation = {
  term: string;
  expectedNoteMatches: number;
};

export type FixtureMetadata = {
  name: string;
  shape: TreeShape;
  noteCount: number;
  folderCount: number;
  nodeCount: number;
  documentCount: number;
  maxDepth: number;
  operationCount: number;
  searchExpectations: SearchExpectation[];
};

export type TreeProjection = {
  metadata: FixtureMetadata;
  operationsDigest: string;
  activeNoteId: string | null;
  nodes: ProjectedNode[];
};

export type TreeNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  depth: number;
  setSize: number;
  posInSet: number;
};

export type TreeIndex = {
  byId: Map<string, TreeNode>;
  childrenByParent: Map<string | null, TreeNode[]>;
  order: TreeNode[];
  maxDepth: number;
};

export type TimingSample = {
  index: number;
  syncMs: number;
  layoutMs: number;
  settledMs: number;
  nextFrameMs: number;
  frameGapMs: number;
  mutatedRows: number;
};

export type TimingSummary = {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export type LongFrameStats = {
  supported: boolean;
  thresholdMs: number;
  count: number;
  maxDurationMs: number;
  maxBlockingMs: number;
};

export type LongTaskStats = {
  supported: boolean;
  thresholdMs: number;
  count: number;
  maxDurationMs: number;
};

export type ScenarioResult = {
  name: string;
  samples: TimingSample[];
  sync: TimingSummary;
  layout: TimingSummary;
  settled: TimingSummary;
  nextFrame: TimingSummary;
  droppedFrames: number;
  maxMutatedRows: number;
  longTasks: LongTaskStats;
  longFrames: LongFrameStats;
};

export type CorrectnessCheck = {
  name: string;
  pass: boolean;
  detail: string;
};

export type EventTimingSample = {
  name: string;
  processingMs: number;
  durationMs: number;
};

export type TrustedKeyResult = {
  keydownCount: number;
  handler: ScenarioResult;
  eventTiming: {
    supported: boolean;
    durationThresholdMs: number;
    entries: EventTimingSample[];
  };
};

export type BenchmarkResult = {
  fixture: FixtureMetadata;
  operationsDigest: string;
  rowHeightPx: number;
  viewportHeightPx: number;
  overscanRows: number;
  fetchMs: number;
  parseMs: number;
  indexMs: number;
  initialFlattenMs: number;
  initialRenderMs: number;
  visibleRowCount: number;
  renderedRowCount: number;
  totalDomElements: number;
  hostMounts: number;
  hydrationCallsDuringMeasurement: number;
  estimatedFrameMs: number;
  scenarios: ScenarioResult[];
  correctness: CorrectnessCheck[];
  unsupportedApis: string[];
  measuredAt: string;
  userAgent: string;
  buildMode: string;
};

export type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};
