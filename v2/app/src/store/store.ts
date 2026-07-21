import type {
  HistoryHeader,
  OperationAck,
  WorkspaceNode,
  WorkspaceOperation,
  WorkspaceSnapshot,
} from "../contracts/workspace";
import { reduceOperation } from "./operations";
import { ancestorIds, buildNodeIndex, flattenVisible, orderAvailableNodes } from "./tree";
import type {
  DocumentRecord,
  Equality,
  Listener,
  NoteMetadata,
  RendererState,
  RendererStore,
  Selector,
} from "./types";

type Subscriber<T = unknown> = {
  active: boolean;
  selector: Selector<T>;
  equality: Equality<T>;
  selected: T;
  listener: Listener;
};

function strictEqual<T>(left: T, right: T): boolean {
  return Object.is(left, right);
}

function derive(
  base: Omit<
    RendererState,
    "nodes" | "childrenByParent" | "nodeOrder" | "visibleIds" | "metadata"
  >,
): RendererState {
  const ordered = orderAvailableNodes([...base.sourceNodes.values()]);
  const index = buildNodeIndex(ordered);
  const metadata = new Map<string, NoteMetadata>();
  for (const node of ordered) {
    if (node.kind !== "note") {
      continue;
    }
    metadata.set(node.id, {
      title: node.title,
      wordCount: base.documents.get(node.id)?.wordCount ?? 0,
      updatedAt: node.updatedAt,
    });
  }
  const activeNoteId =
    base.activeNoteId !== null && metadata.has(base.activeNoteId) ? base.activeNoteId : null;
  const focusedNodeId =
    base.focusedNodeId !== null && index.nodes.has(base.focusedNodeId)
      ? base.focusedNodeId
      : activeNoteId;
  const editingNodeId =
    base.editingNodeId !== null && index.nodes.has(base.editingNodeId)
      ? base.editingNodeId
      : null;
  return {
    ...base,
    ...index,
    visibleIds: flattenVisible(index.nodes, index.childrenByParent, base.expandedIds),
    activeNoteId,
    focusedNodeId,
    editingNodeId,
    metadata,
  };
}

export function createInitialState(snapshot: WorkspaceSnapshot): RendererState {
  const sourceNodes = new Map<string, WorkspaceNode>();
  for (const node of snapshot.nodes) {
    sourceNodes.set(node.id, node);
  }
  const documents = new Map<string, DocumentRecord>();
  for (const document of snapshot.documents) {
    documents.set(document.noteId, document);
  }
  const expandedIds = new Set(
    snapshot.nodes.filter((node) => node.kind === "folder").map((node) => node.id),
  );
  const historyHeaders = new Map<string, HistoryHeader[]>();
  for (const header of snapshot.historyHeaders) {
    const existing = historyHeaders.get(header.noteId) ?? [];
    existing.push(header);
    historyHeaders.set(header.noteId, existing);
  }
  for (const headers of historyHeaders.values()) {
    headers.sort((left, right) => right.createdAt - left.createdAt);
  }
  const derived = derive({
    sourceNodes,
    expandedIds,
    activeNoteId: snapshot.activeNoteId,
    focusedNodeId: snapshot.activeNoteId,
    editingNodeId: null,
    documents,
    historyHeaders,
    settings: snapshot.settings,
  });
  if (derived.activeNoteId === null) {
    const firstNote = derived.nodeOrder.find(
      (id) => derived.nodes.get(id)?.kind === "note",
    );
    if (firstNote) {
      return { ...derived, activeNoteId: firstNote, focusedNodeId: firstNote };
    }
  }
  return derived;
}

function reduceState(
  current: RendererState,
  operation: WorkspaceOperation,
): RendererState {
  if (operation.type === "set_active_note") {
    if (
      operation.noteId !== null &&
      current.nodes.get(operation.noteId)?.kind !== "note"
    ) {
      return current;
    }
    if (operation.noteId === current.activeNoteId) {
      return current;
    }
    return {
      ...current,
      activeNoteId: operation.noteId,
      focusedNodeId: operation.noteId ?? current.focusedNodeId,
    };
  }
  if (operation.type === "update_settings") {
    return { ...current, settings: operation.settings };
  }
  if (operation.type === "save_document") {
    const existing = current.documents.get(operation.noteId);
    if (!existing) {
      return current;
    }
    const documents = new Map(current.documents);
    documents.set(operation.noteId, {
      ...existing,
      documentJson: operation.documentJson,
      markdown: operation.markdown,
      wordCount: operation.wordCount,
    });
    const sourceNode = current.sourceNodes.get(operation.noteId);
    const sourceNodes = new Map(current.sourceNodes);
    if (sourceNode) {
      sourceNodes.set(operation.noteId, { ...sourceNode, updatedAt: operation.at });
    }
    return derive({ ...current, sourceNodes, documents });
  }

  const sourceNodes = reduceOperation(current.sourceNodes, operation);
  if (sourceNodes === current.sourceNodes) {
    return current;
  }
  let documents: ReadonlyMap<string, DocumentRecord> = current.documents;
  let expandedIds: ReadonlySet<string> = current.expandedIds;
  let focusedNodeId = current.focusedNodeId;
  let activeNoteId = current.activeNoteId;
  if (operation.type === "create_note") {
    const withCreated = new Map(documents);
    withCreated.set(operation.id, {
      noteId: operation.id,
      documentJson: operation.documentJson,
      markdown: operation.markdown,
      revision: 0,
      wordCount: 0,
    });
    documents = withCreated;
    activeNoteId = operation.id;
    focusedNodeId = operation.id;
  }
  if (operation.type === "create_folder") {
    const withCreated = new Set(expandedIds);
    withCreated.add(operation.id);
    expandedIds = withCreated;
    focusedNodeId = operation.id;
  }
  if (operation.type === "purge_subtree") {
    documents = new Map(
      [...documents].filter(([noteId]) => sourceNodes.has(noteId)),
    );
  }
  return derive({
    ...current,
    sourceNodes,
    documents,
    expandedIds,
    focusedNodeId,
    activeNoteId,
  });
}

export function createRendererStore(initialState: RendererState): RendererStore {
  let state = initialState;
  let destroyed = false;
  const subscribers = new Set<Subscriber>();
  let publishing = false;
  const queuedUpdaters: ((state: RendererState) => RendererState)[] = [];

  function subscribe<T>(
    selector: Selector<T>,
    listener: Listener,
    equality: Equality<T> = strictEqual,
  ): () => void {
    if (destroyed) {
      throw new Error("renderer store is destroyed");
    }
    const subscriber: Subscriber<T> = {
      active: true,
      selector,
      equality,
      selected: selector(state),
      listener,
    };
    subscribers.add(subscriber as Subscriber);
    return () => {
      if (!subscriber.active) {
        return;
      }
      subscriber.active = false;
      subscribers.delete(subscriber as Subscriber);
    };
  }

  function update(updater: (current: RendererState) => RendererState): boolean {
    if (destroyed) {
      throw new Error("renderer store is destroyed");
    }
    if (publishing) {
      queuedUpdaters.push(updater);
      return true;
    }
    const failures: unknown[] = [];
    let changed = false;
    publishing = true;
    queuedUpdaters.push(updater);
    while (queuedUpdaters.length > 0) {
      const nextUpdater = queuedUpdaters.shift();
      if (!nextUpdater) {
        break;
      }
      const next = nextUpdater(state);
      if (Object.is(next, state)) {
        continue;
      }
      state = next;
      changed = true;
      for (const subscriber of [...subscribers]) {
        if (!subscriber.active) {
          continue;
        }
        let selected: unknown;
        try {
          selected = subscriber.selector(state);
          if (subscriber.equality(subscriber.selected, selected)) {
            continue;
          }
        } catch (error) {
          failures.push(error);
          continue;
        }
        subscriber.selected = selected;
        try {
          subscriber.listener();
        } catch (error) {
          failures.push(error);
        }
      }
    }
    publishing = false;
    if (failures.length > 0) {
      throw new AggregateError(failures, "renderer store subscriber failure");
    }
    return changed;
  }

  function setActiveNote(id: string | null): boolean {
    return update((current) => reduceState(current, { type: "set_active_note", noteId: id }));
  }

  function setFocusedNode(id: string | null): boolean {
    return update((current) => {
      if (id === current.focusedNodeId) {
        return current;
      }
      if (id !== null && !current.nodes.has(id)) {
        return current;
      }
      return { ...current, focusedNodeId: id };
    });
  }

  function setEditingNode(id: string | null): boolean {
    return update((current) => {
      if (id === current.editingNodeId) {
        return current;
      }
      if (id !== null && !current.nodes.has(id)) {
        return current;
      }
      return { ...current, editingNodeId: id };
    });
  }

  function toggleExpanded(id: string): boolean {
    return update((current) => {
      const node = current.nodes.get(id);
      if (!node || node.kind !== "folder") {
        return current;
      }
      const expandedIds = new Set(current.expandedIds);
      const collapsing = expandedIds.delete(id);
      if (!collapsing) {
        expandedIds.add(id);
      }
      let focusedNodeId = current.focusedNodeId;
      if (collapsing && focusedNodeId && ancestorIds(current.nodes, focusedNodeId).includes(id)) {
        focusedNodeId = id;
      }
      return {
        ...current,
        expandedIds,
        visibleIds: flattenVisible(current.nodes, current.childrenByParent, expandedIds),
        focusedNodeId,
      };
    });
  }

  function applyOperations(operations: readonly WorkspaceOperation[]): boolean {
    return update((current) => {
      let next = current;
      for (const operation of operations) {
        next = reduceState(next, operation);
      }
      return next;
    });
  }

  function applyAck(ack: OperationAck): boolean {
    return update((current) => {
      let rankChanged = false;
      const sourceNodes = new Map(current.sourceNodes);
      for (const change of ack.rankChanges) {
        const existing = sourceNodes.get(change.id);
        if (!existing) {
          continue;
        }
        sourceNodes.set(change.id, {
          ...existing,
          parentId: change.parentId,
          rank: change.rank,
        });
        rankChanged = true;
      }
      let revisionChanged = false;
      const documents = new Map(current.documents);
      for (const revision of ack.revisions) {
        const existing = documents.get(revision.id);
        if (!existing || existing.revision === revision.revision) {
          continue;
        }
        documents.set(revision.id, { ...existing, revision: revision.revision });
        revisionChanged = true;
      }
      if (!rankChanged && !revisionChanged) {
        return current;
      }
      return derive({ ...current, sourceNodes, documents });
    });
  }

  function replaceFromSnapshot(snapshot: WorkspaceSnapshot): boolean {
    return update((current) => {
      const fresh = createInitialState(snapshot);
      const expandedIds = new Set(
        [...current.expandedIds].filter((id) => fresh.nodes.get(id)?.kind === "folder"),
      );
      return derive({
        ...fresh,
        expandedIds,
        activeNoteId: current.activeNoteId,
        focusedNodeId: current.focusedNodeId,
        editingNodeId: null,
      });
    });
  }

  return {
    getState: () => state,
    select: (selector) => selector(state),
    subscribe,
    createBinding<T>(selector: Selector<T>, equality: Equality<T> = strictEqual) {
      let selected = selector(state);
      return {
        getSnapshot: () => {
          const next = selector(state);
          if (!equality(selected, next)) {
            selected = next;
          }
          return selected;
        },
        subscribe: (listener) => subscribe(selector, listener, equality),
      };
    },
    update,
    setActiveNote,
    setFocusedNode,
    setEditingNode,
    toggleExpanded,
    applyOperations,
    applyAck,
    replaceFromSnapshot,
    destroy: () => {
      destroyed = true;
      for (const subscriber of subscribers) {
        subscriber.active = false;
      }
      subscribers.clear();
    },
  };
}
