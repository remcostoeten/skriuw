import type {
  HistoryHeader,
  OperationAck,
  WorkspaceNode,
  WorkspaceOperation,
  WorkspaceSnapshot,
} from "../contracts/workspace";
import { extractReferences } from "../references/extract";
import {
  buildReferenceProjection,
  removeSourceNotes,
  removeTarget,
  updateNoteReferences,
  type ReferenceProjection,
} from "../references/projection";
import {
  emptyReferenceBootstrap,
  referenceKey,
  type PersonRecord,
  type ReferenceBootstrap,
  type ReferenceOperation,
  type TagRecord,
} from "../references/types";
import { reduceOperation } from "./operations";
import {
  ancestorIds,
  buildNodeIndex,
  flattenVisible,
  orderAvailableNodes,
  visibleTreeRange,
} from "./tree";
import type {
  DocumentRecord,
  Equality,
  Listener,
  NoteMetadata,
  RendererState,
  RendererStore,
  Selector,
  TreeSelectionMode,
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

function compareHistoryHeaders(left: HistoryHeader, right: HistoryHeader): number {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }
  if (left.versionId === right.versionId) {
    return 0;
  }
  return left.versionId < right.versionId ? -1 : 1;
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
  const selectedNodeIds = new Set(
    [...base.selectedNodeIds].filter((id) => index.nodes.has(id)),
  );
  const selectionAnchorId =
    base.selectionAnchorId !== null && index.nodes.has(base.selectionAnchorId)
      ? base.selectionAnchorId
      : null;
  return {
    ...base,
    ...index,
    visibleIds: flattenVisible(index.nodes, index.childrenByParent, base.expandedIds),
    activeNoteId,
    focusedNodeId,
    selectedNodeIds,
    selectionAnchorId,
    editingNodeId,
    metadata,
  };
}

function referenceState(current: RendererState): ReferenceProjection {
  return {
    outgoingReferences: current.outgoingReferences,
    incomingReferences: current.incomingReferences,
  };
}

export function createInitialState(
  snapshot: WorkspaceSnapshot,
  expandedFolderIds?: readonly string[],
  references: ReferenceBootstrap = emptyReferenceBootstrap(),
): RendererState {
  const sourceNodes = new Map<string, WorkspaceNode>();
  for (const node of snapshot.nodes) {
    sourceNodes.set(node.id, node);
  }
  const documents = new Map<string, DocumentRecord>();
  for (const document of snapshot.documents) {
    documents.set(document.noteId, document);
  }
  const requestedExpansion =
    expandedFolderIds ??
    snapshot.nodes.filter((node) => node.kind === "folder").map((node) => node.id);
  const expandedIds = new Set(
    requestedExpansion.filter((id) => sourceNodes.get(id)?.kind === "folder"),
  );
  const historyHeaders = new Map<string, HistoryHeader[]>();
  for (const header of snapshot.historyHeaders) {
    const existing = historyHeaders.get(header.noteId) ?? [];
    existing.push(header);
    historyHeaders.set(header.noteId, existing);
  }
  for (const headers of historyHeaders.values()) {
    headers.sort(compareHistoryHeaders);
  }
  const rememberedNoteId =
    snapshot.settings.rememberLastNote === false ? null : snapshot.activeNoteId;
  const tags = new Map<string, TagRecord>();
  for (const tag of references.tags) {
    tags.set(tag.id, tag);
  }
  const people = new Map<string, PersonRecord>();
  for (const person of references.people) {
    people.set(person.id, person);
  }
  const derived = derive({
    sourceNodes,
    expandedIds,
    activeNoteId: rememberedNoteId,
    focusedNodeId: rememberedNoteId,
    selectedNodeIds: new Set(),
    selectionAnchorId: null,
    editingNodeId: null,
    documents,
    historyHeaders,
    settings: snapshot.settings,
    tags,
    people,
    ...buildReferenceProjection(references.references),
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
    const projection = updateNoteReferences(
      referenceState(current),
      operation.noteId,
      extractReferences(operation.documentJson),
    );
    return derive({ ...current, sourceNodes, documents, ...projection });
  }

  const sourceNodes = reduceOperation(current.sourceNodes, operation);
  if (sourceNodes === current.sourceNodes) {
    return current;
  }
  let documents: ReadonlyMap<string, DocumentRecord> = current.documents;
  let expandedIds: ReadonlySet<string> = current.expandedIds;
  let focusedNodeId = current.focusedNodeId;
  let activeNoteId = current.activeNoteId;
  let projection: ReferenceProjection | null = null;
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
    projection = updateNoteReferences(
      referenceState(current),
      operation.id,
      extractReferences(operation.documentJson),
    );
  }
  if (operation.type === "create_folder") {
    const withCreated = new Set(expandedIds);
    withCreated.add(operation.id);
    expandedIds = withCreated;
    focusedNodeId = operation.id;
  }
  if (operation.type === "purge_subtree") {
    const purgedNoteIds = [...documents.keys()].filter((noteId) => !sourceNodes.has(noteId));
    documents = new Map(
      [...documents].filter(([noteId]) => sourceNodes.has(noteId)),
    );
    expandedIds = new Set(
      [...expandedIds].filter((id) => sourceNodes.get(id)?.kind === "folder"),
    );
    projection = removeSourceNotes(referenceState(current), purgedNoteIds);
  }
  return derive({
    ...current,
    sourceNodes,
    documents,
    expandedIds,
    focusedNodeId,
    activeNoteId,
    ...projection,
  });
}

function reduceReferenceOperation(
  current: RendererState,
  operation: ReferenceOperation,
): RendererState {
  if (operation.type === "create_tag") {
    if (current.tags.has(operation.tag.id)) {
      return current;
    }
    const tags = new Map(current.tags);
    tags.set(operation.tag.id, operation.tag);
    return { ...current, tags };
  }
  if (operation.type === "rename_tag") {
    const existing = current.tags.get(operation.id);
    if (!existing || existing.name === operation.name) {
      return current;
    }
    const tags = new Map(current.tags);
    tags.set(operation.id, { ...existing, name: operation.name, updatedAt: Date.now() });
    return { ...current, tags };
  }
  if (operation.type === "recolor_tag") {
    const existing = current.tags.get(operation.id);
    if (!existing || existing.color === operation.color) {
      return current;
    }
    const tags = new Map(current.tags);
    tags.set(operation.id, { ...existing, color: operation.color, updatedAt: Date.now() });
    return { ...current, tags };
  }
  if (operation.type === "delete_tag") {
    if (!current.tags.has(operation.id)) {
      return current;
    }
    const tags = new Map(current.tags);
    tags.delete(operation.id);
    return {
      ...current,
      tags,
      incomingReferences: removeTarget(
        current.incomingReferences,
        referenceKey("tag", operation.id),
      ),
    };
  }
  if (operation.type === "create_person") {
    if (current.people.has(operation.person.id)) {
      return current;
    }
    const people = new Map(current.people);
    people.set(operation.person.id, operation.person);
    return { ...current, people };
  }
  if (operation.type === "rename_person") {
    const existing = current.people.get(operation.id);
    if (!existing || existing.name === operation.name) {
      return current;
    }
    const people = new Map(current.people);
    people.set(operation.id, { ...existing, name: operation.name, updatedAt: Date.now() });
    return { ...current, people };
  }
  if (operation.type === "recolor_person") {
    const existing = current.people.get(operation.id);
    if (!existing || existing.color === operation.color) {
      return current;
    }
    const people = new Map(current.people);
    people.set(operation.id, { ...existing, color: operation.color, updatedAt: Date.now() });
    return { ...current, people };
  }
  if (!current.people.has(operation.id)) {
    return current;
  }
  const people = new Map(current.people);
  people.delete(operation.id);
  return {
    ...current,
    people,
    incomingReferences: removeTarget(
      current.incomingReferences,
      referenceKey("person", operation.id),
    ),
  };
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

  function selectTreeNode(id: string, mode: TreeSelectionMode): boolean {
    return update((current) => {
      if (!current.nodes.has(id)) {
        return current;
      }
      if (mode === "replace") {
        return {
          ...current,
          selectedNodeIds: new Set([id]),
          selectionAnchorId: id,
        };
      }
      if (mode === "toggle") {
        const selectedNodeIds = new Set(current.selectedNodeIds);
        if (selectedNodeIds.has(id)) {
          selectedNodeIds.delete(id);
        } else {
          selectedNodeIds.add(id);
        }
        return { ...current, selectedNodeIds, selectionAnchorId: id };
      }
      const anchorId = current.selectionAnchorId ?? current.focusedNodeId ?? id;
      return {
        ...current,
        selectedNodeIds: visibleTreeRange(current.visibleIds, anchorId, id),
        selectionAnchorId: anchorId,
      };
    });
  }

  function selectAllTreeNodes(): boolean {
    return update((current) => {
      if (current.visibleIds.length === 0) {
        return current;
      }
      return {
        ...current,
        selectedNodeIds: new Set(current.visibleIds),
        selectionAnchorId: current.visibleIds[0] ?? null,
      };
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

  function applyReferenceOperations(operations: readonly ReferenceOperation[]): boolean {
    return update((current) => {
      let next = current;
      for (const operation of operations) {
        next = reduceReferenceOperation(next, operation);
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

  function publishHistoryHeader(header: HistoryHeader): boolean {
    return update((current) => {
      if (!current.documents.has(header.noteId)) {
        return current;
      }
      const existing = current.historyHeaders.get(header.noteId) ?? [];
      if (existing.some((candidate) => candidate.versionId === header.versionId)) {
        return current;
      }
      const headers = existing
        .concat(header)
        .sort(compareHistoryHeaders);
      const historyHeaders = new Map(current.historyHeaders);
      historyHeaders.set(header.noteId, headers);
      return { ...current, historyHeaders };
    });
  }

  function replaceFromSnapshot(snapshot: WorkspaceSnapshot): boolean {
    return update((current) => {
      const fresh = createInitialState(snapshot, undefined, {
        tags: snapshot.tags ?? [...current.tags.values()],
        people: snapshot.people ?? [...current.people.values()],
        references:
          snapshot.references ??
          [...current.outgoingReferences.entries()].map(([noteId, targets]) => ({
            noteId,
            targets,
          })),
      });
      const expandedIds = new Set(
        [...current.expandedIds].filter((id) => fresh.nodes.get(id)?.kind === "folder"),
      );
      return derive({
        ...fresh,
        expandedIds,
        activeNoteId: current.activeNoteId,
        focusedNodeId: current.focusedNodeId,
        selectedNodeIds: current.selectedNodeIds,
        selectionAnchorId: current.selectionAnchorId,
        editingNodeId: null,
        tags: fresh.tags,
        people: fresh.people,
        outgoingReferences: fresh.outgoingReferences,
        incomingReferences: fresh.incomingReferences,
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
    selectTreeNode,
    selectAllTreeNodes,
    setEditingNode,
    toggleExpanded,
    applyOperations,
    applyReferenceOperations,
    applyAck,
    publishHistoryHeader,
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
