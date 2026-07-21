import type { NodeKind, WorkspaceSettings } from "../contracts/workspace";

export type NodeRecord = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  depth: number;
  setSize: number;
  posInSet: number;
};

export type DocumentRecord = {
  noteId: string;
  documentJson: unknown;
  markdown: string;
  revision: number;
  wordCount: number;
};

export type NoteMetadata = {
  title: string;
  wordCount: number;
  updatedAt: number;
};

export type RendererState = {
  nodes: ReadonlyMap<string, NodeRecord>;
  childrenByParent: ReadonlyMap<string | null, readonly string[]>;
  nodeOrder: readonly string[];
  visibleIds: readonly string[];
  expandedIds: ReadonlySet<string>;
  activeNoteId: string | null;
  focusedNodeId: string | null;
  documents: ReadonlyMap<string, DocumentRecord>;
  metadata: ReadonlyMap<string, NoteMetadata>;
  settings: WorkspaceSettings;
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
  toggleExpanded: (id: string) => boolean;
  destroy: () => void;
};
