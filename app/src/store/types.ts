import type {
  HistoryHeader,
  NoteProperty,
  NotePropertyTemplate,
  OperationAck,
  ProviderImportReceipt,
  WorkspaceImage,
  WorkspaceNode,
  WorkspaceOperation,
  WorkspaceSettings,
  WorkspaceSnapshot,
  WorkspacePrompt,
  WorkspaceAnnotation,
  WorkspaceDelta,
  WorkspaceTask,
} from "@/contracts/workspace";
import type {
  IncomingReferences,
  OutgoingReferences,
} from "@/features/references/projection";
import type { PersonRecord, ReferenceOperation, TagRecord } from "@/features/references/types";
import type { ClosedTab, PaneState, SplitOrientation } from "./panes";

export type NodeRecord = {
  id: string;
  parentId: string | null;
  kind: WorkspaceNode["kind"];
  title: string;
  depth: number;
  setSize: number;
  posInSet: number;
  descendantCount: number;
};

export type DocumentRecord = {
  noteId: string;
  documentJson: unknown;
  markdown: string;
  revision: number;
  wordCount: number;
  hasLosslessMarkdown: boolean;
};

export type NoteMetadata = {
  title: string;
  wordCount: number;
  updatedAt: number;
};

/** Session-local activity relationship; intentionally excluded from persistence. */
export type CoVisit = { count: number; lastVisitedAt: number };
export type CoVisits = ReadonlyMap<string, ReadonlyMap<string, CoVisit>>;

export type TreeSelectionMode = "replace" | "toggle" | "range";

export type RendererState = {
  sourceNodes: ReadonlyMap<string, WorkspaceNode>;
  nodes: ReadonlyMap<string, NodeRecord>;
  childrenByParent: ReadonlyMap<string | null, readonly string[]>;
  nodeOrder: readonly string[];
  /** Note ids in tree order; precomputed so navigation never scans `nodes`. */
  noteIds: readonly string[];
  visibleIds: readonly string[];
  expandedIds: ReadonlySet<string>;
  panes: readonly PaneState[];
  /** Split geometry. Kept beside `panes` so resizing never invalidates tab subscriptions. */
  splitOrientation: SplitOrientation;
  splitRatio: number;
  focusedPaneId: string;
  /** Per-pane reopen stack for closed tabs. Session-only, never persisted. */
  closedTabsByPaneId: ReadonlyMap<string, readonly ClosedTab[]>;
  editorModeByNoteId: ReadonlyMap<string, "rendered" | "raw">;
  /** The note whose annotation layer is open for editing. Session-only. */
  annotatingNoteId: string | null;
  activeNoteId: string | null;
  focusedNodeId: string | null;
  selectedNodeIds: ReadonlySet<string>;
  selectionAnchorId: string | null;
  editingNodeId: string | null;
  documents: ReadonlyMap<string, DocumentRecord>;
  metadata: ReadonlyMap<string, NoteMetadata>;
  historyHeaders: ReadonlyMap<string, readonly HistoryHeader[]>;
  settings: WorkspaceSettings;
  tags: ReadonlyMap<string, TagRecord>;
  people: ReadonlyMap<string, PersonRecord>;
  images: ReadonlyMap<string, WorkspaceImage>;
  tasks: ReadonlyMap<string, WorkspaceTask>;
  annotations: ReadonlyMap<string, WorkspaceAnnotation>;
  prompts: ReadonlyMap<string, WorkspacePrompt>;
  propertiesByNoteId: ReadonlyMap<string, readonly NoteProperty[]>;
  propertyTemplates: readonly NotePropertyTemplate[];
  importReceipts: readonly ProviderImportReceipt[];
  outgoingReferences: OutgoingReferences;
  incomingReferences: IncomingReferences;
  coVisits: CoVisits;
};

export type Equality<T> = (left: T, right: T) => boolean;

export type Selector<T> = (state: RendererState) => T;

export type Listener = () => void;

export type SelectorBinding<T> = {
  getSnapshot: () => T;
  subscribe: (listener: Listener) => () => void;
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
  setFocusedNode: (id: string | null) => boolean;
  selectTreeNode: (id: string, mode: TreeSelectionMode) => boolean;
  selectAllTreeNodes: () => boolean;
  clearTreeSelection: () => boolean;
  setEditingNode: (id: string | null) => boolean;
  toggleExpanded: (id: string) => boolean;
  applyOperations: (operations: readonly WorkspaceOperation[]) => boolean;
  applyReferenceOperations: (operations: readonly ReferenceOperation[]) => boolean;
  applyAck: (ack: OperationAck) => boolean;
  publishHistoryHeader: (header: HistoryHeader) => boolean;
  replaceFromSnapshot: (snapshot: WorkspaceSnapshot) => boolean;
  /**
   * Adopts remotely changed documents and their node records without a full
   * snapshot. A record only moves forward: a current revision above the
   * delta's is kept, and an equal revision with equal markdown keeps its
   * object identity so unchanged subscribers stay quiet.
   */
  applyRemoteDocuments: (delta: WorkspaceDelta) => boolean;
  destroy: () => void;
};
