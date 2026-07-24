export type NodeKind = "folder" | "note";

export type ProjectedNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
};

export type FixtureMetadata = {
  name: string;
  shape: "wide" | "nested" | "mixed";
  noteCount: number;
  folderCount: number;
  nodeCount: number;
  documentCount: number;
  maxDepth: number;
  operationCount: number;
};

export type TreeProjection = {
  metadata: FixtureMetadata;
  operationsDigest: string;
  activeNoteId: string | null;
  nodes: ProjectedNode[];
};

export type NodeRecord = ProjectedNode & {
  depth: number;
  setSize: number;
  posInSet: number;
};

export type DocumentRecord = {
  id: string;
  preparedIdentity: string;
};

export type NoteMetadata = {
  title: string;
  wordCount: number;
  updatedAt: string;
};

export type RendererState = {
  nodes: ReadonlyMap<string, NodeRecord>;
  childrenByParent: ReadonlyMap<string | null, readonly string[]>;
  nodeOrder: readonly string[];
  visibleIds: readonly string[];
  expandedIds: ReadonlySet<string>;
  disabledIds: ReadonlySet<string>;
  activeNoteId: string | null;
  focusedNodeId: string | null;
  documents: ReadonlyMap<string, DocumentRecord>;
  metadata: ReadonlyMap<string, NoteMetadata>;
  settingsSelection: "workspace" | "appearance";
};

export type Equality<T> = (left: T, right: T) => boolean;

export type Selector<T> = (state: RendererState) => T;

export type Listener = () => void;

export type SelectorBinding<T> = {
  getSnapshot: () => T;
  subscribe: (listener: Listener) => () => void;
};

export type StoreDiagnostics = {
  notifications: number;
  selectorEvaluations: number;
  updateAttempts: number;
  effectiveUpdates: number;
  listenerCount: number;
  peakListenerCount: number;
  listenerFailures: number;
};

export type RendererStore = {
  getState: () => RendererState;
  select: <T>(selector: Selector<T>) => T;
  subscribe: <T>(
    selector: Selector<T>,
    listener: Listener,
    equality?: Equality<T>,
  ) => () => void;
  createBinding: <T>(selector: Selector<T>, equality?: Equality<T>) => SelectorBinding<T>;
  update: (updater: (state: RendererState) => RendererState) => boolean;
  setActiveNote: (id: string | null) => boolean;
  toggleExpanded: (id: string) => boolean;
  setMetadataTitle: (id: string, title: string) => boolean;
  diagnostics: () => StoreDiagnostics;
  resetDiagnostics: () => void;
  destroy: () => void;
};

export type RenderLedger = {
  renders: Record<string, number>;
  mounts: Record<string, number>;
  unmounts: Record<string, number>;
  profiledRenders: Record<string, number>;
  commits: number;
  commitDurationsMs: number[];
};

export type TimingSummary = {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export type ScenarioResult = {
  name: string;
  samplesMs: number[];
  frameGapsMs: number[];
  droppedFrames: number;
  timing: TimingSummary;
  notifications: number;
  commits: number;
  renders: Record<string, number>;
  profiledRenders: Record<string, number>;
  expectedTreeRowRenders: Record<string, number>;
};

export type CorrectnessCheck = {
  name: string;
  pass: boolean;
  detail: string;
};
