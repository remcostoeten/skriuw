import type {
  HistoryHeader,
  NoteProperty,
  OperationAck,
  WorkspaceImage,
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
  type NoteReferences,
  type PersonRecord,
  type ReferenceBootstrap,
  type ReferenceOperation,
  type TagRecord,
} from "../references/types";
import {
  removeNoteProperty,
  reorderNoteProperties,
  upsertNoteProperty,
} from "../properties/operations";
import {
  deletePropertyTemplate,
  reorderPropertyTemplates,
  upsertPropertyTemplate,
} from "../properties/templates";
import { isPropertyValidationError } from "../properties/value";
import { opensNotesInTabs } from "../settings/settings-model";
import { reduceOperation } from "./operations";
import { PRIMARY_PANE_ID, defaultPanes, syncPanes } from "./panes";
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
    "nodes" | "childrenByParent" | "nodeOrder" | "noteIds" | "visibleIds" | "metadata"
  >,
): RendererState {
  const ordered = orderAvailableNodes([...base.sourceNodes.values()]);
  const index = buildNodeIndex(ordered);
  const metadata = new Map<string, NoteMetadata>();
  const noteIds: string[] = [];
  for (const node of ordered) {
    if (node.kind !== "note") {
      continue;
    }
    noteIds.push(node.id);
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
  const panes = syncPanes(
    base.panes,
    activeNoteId,
    base.sourceNodes,
    opensNotesInTabs(base.settings),
  );
  return {
    ...base,
    ...index,
    panes,
    noteIds,
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
  const images = new Map<string, WorkspaceImage>();
  for (const image of snapshot.images ?? []) {
    images.set(image.id, image);
  }
  const propertiesByNoteId = new Map<string, NoteProperty[]>();
  for (const property of snapshot.properties ?? []) {
    const properties = propertiesByNoteId.get(property.noteId) ?? [];
    properties.push(property);
    propertiesByNoteId.set(property.noteId, properties);
  }
  for (const properties of propertiesByNoteId.values()) {
    properties.sort((left, right) => left.position - right.position);
  }
  const propertyTemplates = [...(snapshot.propertyTemplates ?? [])].sort(
    (left, right) => left.position - right.position,
  );
  const derived = derive({
    sourceNodes,
    expandedIds,
    panes: defaultPanes(rememberedNoteId),
    focusedPaneId: PRIMARY_PANE_ID,
    closedTabsByPaneId: new Map(),
    editorModeByNoteId: new Map(),
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
    images,
    propertiesByNoteId,
    propertyTemplates,
    importReceipts: snapshot.importReceipts ?? [],
    ...buildReferenceProjection(references.references),
  });
  if (derived.activeNoteId === null) {
    const firstNote = derived.nodeOrder.find(
      (id) => derived.nodes.get(id)?.kind === "note",
    );
    if (firstNote) {
      return {
        ...derived,
        activeNoteId: firstNote,
        focusedNodeId: firstNote,
        panes: syncPanes(derived.panes, firstNote, derived.sourceNodes),
      };
    }
  }
  return derived;
}

function reduceState(
  current: RendererState,
  operation: WorkspaceOperation,
): RendererState {
  if (operation.type === "record_provider_import") {
    const importReceipts = current.importReceipts.filter(
      (receipt) =>
        receipt.provider !== operation.receipt.provider ||
        receipt.sourceKey !== operation.receipt.sourceKey ||
        receipt.sourcePath !== operation.receipt.sourcePath,
    );
    return {
      ...current,
      importReceipts: [...importReceipts, operation.receipt],
    };
  }
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
      panes: syncPanes(
        current.panes,
        operation.noteId,
        current.sourceNodes,
        opensNotesInTabs(current.settings),
      ),
    };
  }
  if (operation.type === "update_settings") {
    return { ...current, settings: operation.settings };
  }
  if (operation.type === "attach_image") {
    if (current.images.has(operation.image.id)) {
      return current;
    }
    const images = new Map(current.images);
    images.set(operation.image.id, operation.image);
    return { ...current, images };
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
    // Saves cannot change tree structure (ordering is rank/parentId/deletedAt),
    // so skip derive: rebuilding the index would hand every unchanged record a
    // new identity and re-render the shell on the typing path.
    const noteMetadata = current.metadata.get(operation.noteId);
    let metadata: ReadonlyMap<string, NoteMetadata> = current.metadata;
    if (noteMetadata) {
      const patched = new Map(current.metadata);
      patched.set(operation.noteId, {
        ...noteMetadata,
        wordCount: operation.wordCount,
        updatedAt: operation.at,
      });
      metadata = patched;
    }
    return { ...current, sourceNodes, documents, metadata, ...projection };
  }
  if (operation.type === "set_note_property") {
    if (current.sourceNodes.get(operation.property.noteId)?.kind !== "note") {
      return current;
    }
    try {
      const currentProperties = current.propertiesByNoteId.get(operation.property.noteId) ?? [];
      const nextProperties = upsertNoteProperty(currentProperties, operation.property, {
        personIds: new Set(current.people.keys()),
      });
      const propertiesByNoteId = new Map(current.propertiesByNoteId);
      propertiesByNoteId.set(operation.property.noteId, nextProperties);
      return { ...current, propertiesByNoteId };
    } catch (error) {
      if (isPropertyValidationError(error)) return current;
      throw error;
    }
  }
  if (operation.type === "remove_note_property") {
    const currentProperties = current.propertiesByNoteId.get(operation.noteId);
    if (!currentProperties) return current;
    try {
      const nextProperties = removeNoteProperty(currentProperties, operation.propertyId);
      const propertiesByNoteId = new Map(current.propertiesByNoteId);
      if (nextProperties.length === 0) propertiesByNoteId.delete(operation.noteId);
      else propertiesByNoteId.set(operation.noteId, nextProperties);
      return { ...current, propertiesByNoteId };
    } catch (error) {
      if (isPropertyValidationError(error)) return current;
      throw error;
    }
  }
  if (operation.type === "reorder_note_properties") {
    const currentProperties = current.propertiesByNoteId.get(operation.noteId);
    if (!currentProperties) return current;
    try {
      const nextProperties = reorderNoteProperties(
        currentProperties,
        operation.orderedPropertyIds,
      );
      const propertiesByNoteId = new Map(current.propertiesByNoteId);
      propertiesByNoteId.set(operation.noteId, nextProperties);
      return { ...current, propertiesByNoteId };
    } catch (error) {
      if (isPropertyValidationError(error)) return current;
      throw error;
    }
  }
  if (operation.type === "set_note_property_template") {
    try {
      return {
        ...current,
        propertyTemplates: upsertPropertyTemplate(
          current.propertyTemplates,
          operation.template,
        ),
      };
    } catch (error) {
      if (isPropertyValidationError(error)) return current;
      throw error;
    }
  }
  if (operation.type === "delete_note_property_template") {
    try {
      return {
        ...current,
        propertyTemplates: deletePropertyTemplate(
          current.propertyTemplates,
          operation.templateId,
        ),
      };
    } catch (error) {
      if (isPropertyValidationError(error)) return current;
      throw error;
    }
  }
  if (operation.type === "reorder_note_property_templates") {
    try {
      return {
        ...current,
        propertyTemplates: reorderPropertyTemplates(
          current.propertyTemplates,
          operation.orderedTemplateIds,
        ),
      };
    } catch (error) {
      if (isPropertyValidationError(error)) return current;
      throw error;
    }
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
  let images: ReadonlyMap<string, WorkspaceImage> = current.images;
  if (operation.type === "purge_subtree") {
    const purgedNoteIds = [...documents.keys()].filter((noteId) => !sourceNodes.has(noteId));
    documents = new Map(
      [...documents].filter(([noteId]) => sourceNodes.has(noteId)),
    );
    expandedIds = new Set(
      [...expandedIds].filter((id) => sourceNodes.get(id)?.kind === "folder"),
    );
    images = new Map(
      [...images].filter(([, image]) => sourceNodes.has(image.noteId)),
    );
    const propertiesByNoteId = new Map(
      [...current.propertiesByNoteId].filter(([noteId]) => sourceNodes.has(noteId)),
    );
    projection = removeSourceNotes(referenceState(current), purgedNoteIds);
    return derive({
      ...current,
      sourceNodes,
      documents,
      expandedIds,
      focusedNodeId,
      activeNoteId,
      images,
      propertiesByNoteId,
      ...projection,
    });
  }
  return derive({
    ...current,
    sourceNodes,
    documents,
    expandedIds,
    focusedNodeId,
    activeNoteId,
    images,
    ...projection,
  });
}

function reduceImportBatch(
  current: RendererState,
  operations: readonly WorkspaceOperation[],
): RendererState | null {
  if (
    operations.length < 256 ||
    !operations.some((operation) => operation.type === "record_provider_import") ||
    operations.some(
      (operation) =>
        ![
          "create_tag",
          "create_folder",
          "create_note",
          "rename_node",
          "save_document",
          "attach_image",
          "set_note_property",
          "remove_note_property",
          "record_provider_import",
        ].includes(operation.type) ||
        ((operation.type === "create_folder" ||
          operation.type === "create_note") &&
          operation.placement.position.type !== "last"),
    )
  ) {
    return null;
  }
  const sourceNodes = new Map(current.sourceNodes);
  const documents = new Map(current.documents);
  const tags = new Map(current.tags);
  const images = new Map(current.images);
  const propertiesByNoteId = new Map(current.propertiesByNoteId);
  const importReceipts = new Map(
    current.importReceipts.map((receipt) => [
      `${receipt.provider}\0${receipt.sourceKey}\0${receipt.sourcePath}`,
      receipt,
    ]),
  );
  const references = new Map<string, NoteReferences>(
    [...current.outgoingReferences].map(([noteId, targets]) => [
      noteId,
      { noteId, targets },
    ]),
  );
  const lastRankByParent = new Map<string | null, number>();
  for (const node of sourceNodes.values()) {
    if (node.deletedAt === null) {
      lastRankByParent.set(
        node.parentId,
        Math.max(lastRankByParent.get(node.parentId) ?? 0, node.rank),
      );
    }
  }
  let focusedNodeId = current.focusedNodeId;
  let activeNoteId = current.activeNoteId;
  const expandedIds = new Set(current.expandedIds);
  for (const operation of operations) {
    if (operation.type === "create_tag") {
      tags.set(operation.tag.id, operation.tag);
    } else if (
      operation.type === "create_folder" ||
      operation.type === "create_note"
    ) {
      const parentId = operation.placement.parentId;
      const rank = (lastRankByParent.get(parentId) ?? 0) + 1024;
      lastRankByParent.set(parentId, rank);
      sourceNodes.set(operation.id, {
        id: operation.id,
        kind: operation.type === "create_folder" ? "folder" : "note",
        parentId,
        rank,
        title: operation.title,
        icon: null,
        createdAt: operation.at,
        updatedAt: operation.at,
        deletedAt: null,
        pinnedAt: null,
      });
      focusedNodeId = operation.id;
      if (operation.type === "create_folder") {
        expandedIds.add(operation.id);
      } else {
        activeNoteId = operation.id;
        documents.set(operation.id, {
          noteId: operation.id,
          documentJson: operation.documentJson,
          markdown: operation.markdown,
          revision: 0,
          wordCount: 0,
        });
      }
    } else if (operation.type === "rename_node") {
      const node = sourceNodes.get(operation.id);
      if (node) {
        sourceNodes.set(operation.id, {
          ...node,
          title: operation.title,
          updatedAt: operation.at,
        });
      }
    } else if (operation.type === "save_document") {
      const document = documents.get(operation.noteId);
      if (document) {
        documents.set(operation.noteId, {
          ...document,
          documentJson: operation.documentJson,
          markdown: operation.markdown,
          wordCount: operation.wordCount,
        });
        references.set(operation.noteId, {
          noteId: operation.noteId,
          targets: extractReferences(operation.documentJson),
        });
      }
    } else if (operation.type === "attach_image") {
      images.set(operation.image.id, operation.image);
    } else if (operation.type === "remove_note_property") {
      const properties = propertiesByNoteId.get(operation.noteId) ?? [];
      propertiesByNoteId.set(
        operation.noteId,
        properties.filter((property) => property.id !== operation.propertyId),
      );
    } else if (operation.type === "set_note_property") {
      const properties =
        propertiesByNoteId.get(operation.property.noteId) ?? [];
      propertiesByNoteId.set(
        operation.property.noteId,
        upsertNoteProperty(properties, operation.property, {
          personIds: new Set(current.people.keys()),
        }),
      );
    } else if (operation.type === "record_provider_import") {
      importReceipts.set(
        `${operation.receipt.provider}\0${operation.receipt.sourceKey}\0${operation.receipt.sourcePath}`,
        operation.receipt,
      );
    }
  }
  return derive({
    ...current,
    sourceNodes,
    documents,
    tags,
    images,
    propertiesByNoteId,
    importReceipts: [...importReceipts.values()],
    expandedIds,
    focusedNodeId,
    activeNoteId,
    ...buildReferenceProjection([...references.values()]),
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
      const imported = reduceImportBatch(current, operations);
      if (imported) {
        return imported;
      }
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
      if (rankChanged) {
        return derive({ ...current, sourceNodes, documents });
      }
      // Revision-only acks touch nothing structural; keep every other identity.
      return { ...current, documents };
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
        panes: current.panes,
        focusedPaneId: current.focusedPaneId,
        closedTabsByPaneId: current.closedTabsByPaneId,
        editorModeByNoteId: current.editorModeByNoteId,
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
