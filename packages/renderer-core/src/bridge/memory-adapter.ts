import {
  WORKSPACE_PROTOCOL_VERSION,
  type EntityRevision,
  type NodeRankChange,
  type NoteLockState,
  type NoteProperty,
  type OperationAck,
  type SearchHit,
  type SearchIndexStatus,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceOperation,
  type WorkspaceOperationEnvelope,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "../contracts/workspace";
import { createInitialState, createRendererStore, UNCONFIGURED_NOTE_LOCK } from "../store/store";
import type { DocumentRecord, RendererState } from "../store/types";
import type {
  BridgePort,
  NoteLockSecretInput,
  StoredImagePayload,
  WorkspaceSyncStatus,
} from "./port";

export type MemoryBridgeOptions = {
  snapshot?: WorkspaceSnapshot;
  settings?: WorkspaceSettings;
  activeWorkspaceSlot?: string | null;
  now?: () => number;
};

type InstalledLock = {
  input: NoteLockSecretInput;
  recoveryCode: string;
  unlocked: boolean;
  failedAttempts: number;
};

const MEMORY_SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showTreeGuides: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
};

function emptySnapshot(settings: WorkspaceSettings): WorkspaceSnapshot {
  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: null,
    nodes: [],
    documents: [],
    historyHeaders: [],
    settings,
    tags: [],
    people: [],
    references: [],
  };
}

function documentFromRecord(record: DocumentRecord): WorkspaceDocument {
  const { hasLosslessMarkdown: _derived, ...document } = record;
  return document;
}

function snapshotFromState(state: RendererState): WorkspaceSnapshot {
  const properties: NoteProperty[] = [];
  for (const noteProperties of state.propertiesByNoteId.values()) {
    properties.push(...noteProperties);
  }
  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: state.activeNoteId,
    nodes: [...state.sourceNodes.values()],
    documents: [...state.documents.values()].map(documentFromRecord),
    historyHeaders: [...state.historyHeaders.values()].flat(),
    settings: state.settings,
    tags: [...state.tags.values()],
    people: [...state.people.values()],
    references: [...state.outgoingReferences].map(([noteId, targets]) => ({
      noteId,
      targets: [...targets],
    })),
    images: [...state.images.values()],
    mediaMetadata: [...state.mediaMetadata.values()],
    properties,
    propertyTemplates: [...state.propertyTemplates],
    tasks: [...state.tasks.values()],
    prompts: [...state.prompts.values()],
    annotations: [...state.annotations.values()],
    importReceipts: [...state.importReceipts],
  };
}

function placedNodeId(operation: WorkspaceOperation): string | null {
  if (
    operation.type === "create_folder" ||
    operation.type === "create_note" ||
    operation.type === "move_node"
  ) {
    return operation.id;
  }
  if (operation.type === "restore_subtree") {
    return operation.rootId;
  }
  return null;
}

function sniffMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return "application/octet-stream";
}

/**
 * FNV-1a over two seeds. The native runtimes address media by SHA-256; this
 * adapter only needs a stable key per byte sequence and must run where
 * `crypto.subtle` does not exist (Hermes).
 */
function contentKey(bytes: Uint8Array): string {
  let high = 0x811c9dc5;
  let low = 0x01000193;
  for (const byte of bytes) {
    high = Math.imul(high ^ byte, 0x01000193);
    low = Math.imul(low ^ byte, 0x811c9dc5);
  }
  function hex(value: number) {
    return (value >>> 0).toString(16).padStart(8, "0");
  }
  return `${hex(high)}${hex(low)}${hex(bytes.length)}`;
}

/**
 * The command surface over plain memory, for tests and for interface work
 * that must not wait on a native module. Operations run through the same
 * reducer the renderer uses, so a snapshot read back always matches what an
 * optimistic client already shows. Nothing is durable, ranks are the
 * provisional ranks, and search is an unranked substring scan.
 */
export function createMemoryBridge(options: MemoryBridgeOptions = {}): BridgePort {
  const now = options.now ?? Date.now;
  const seed = options.snapshot ?? emptySnapshot(options.settings ?? MEMORY_SETTINGS);
  const canonical = createRendererStore(
    createInitialState(seed, undefined, {
      tags: seed.tags,
      people: seed.people,
      references: seed.references,
    }),
  );
  const blobs = new Map<string, Uint8Array>();
  let lock: InstalledLock | null = null;
  let expandedFolderIds: string[] | null = null;
  let activeSlot = options.activeWorkspaceSlot ?? null;
  let syncConnected = false;
  let syncOnline = true;

  function lockedNodes(): WorkspaceNode[] {
    return [...canonical.getState().sourceNodes.values()].filter(
      (node) => (node.lockedAt ?? null) !== null && node.deletedAt === null,
    );
  }

  function lockState(): NoteLockState {
    if (lock === null) {
      return UNCONFIGURED_NOTE_LOCK;
    }
    return {
      configured: true,
      unlocked: lock.unlocked,
      kind: lock.input.kind,
      hint: lock.input.hint,
      failedAttempts: lock.failedAttempts,
      nextAttemptAt: null,
      lockedNoteCount: lockedNodes().length,
    };
  }

  function requireUnlocked(): InstalledLock {
    if (lock === null) {
      throw new Error("No note lock is configured.");
    }
    if (!lock.unlocked) {
      throw new Error("The note lock is locked. Unlock it first.");
    }
    return lock;
  }

  function syncStatus(): WorkspaceSyncStatus {
    if (!syncConnected) {
      return { state: "localOnly" };
    }
    return syncOnline ? { state: "upToDate" } : { state: "offline" };
  }

  function indexStatus(): SearchIndexStatus {
    const noteCount = canonical.getState().noteIds.length;
    return {
      indexVersion: 1,
      currentVersion: 1,
      indexedNotes: noteCount,
      noteCount,
      needsRebuild: false,
    };
  }

  function validate(envelopes: readonly WorkspaceOperationEnvelope[]): void {
    const state = canonical.getState();
    const expected = new Map<string, number>();
    for (const { protocolVersion, operation } of envelopes) {
      if (protocolVersion !== WORKSPACE_PROTOCOL_VERSION) {
        throw new Error(
          `Unsupported workspace protocol version ${protocolVersion}; expected ${WORKSPACE_PROTOCOL_VERSION}.`,
        );
      }
      if (operation.type === "create_note") {
        expected.set(operation.id, 0);
      }
      if (operation.type !== "save_document") {
        continue;
      }
      const revision =
        expected.get(operation.noteId) ?? state.documents.get(operation.noteId)?.revision;
      if (revision === undefined) {
        throw new Error(`Cannot save document ${operation.noteId}: the note does not exist.`);
      }
      if (revision !== operation.expectedRevision) {
        throw new Error(
          `Revision conflict for ${operation.noteId}: expected ${operation.expectedRevision}, found ${revision}.`,
        );
      }
      expected.set(operation.noteId, revision + 1);
    }
  }

  function apply(operations: readonly WorkspaceOperation[]): OperationAck {
    canonical.applyOperations(operations);
    const state = canonical.getState();
    const revisions = new Map<string, EntityRevision>();
    const rankChanges = new Map<string, NodeRankChange>();
    for (const operation of operations) {
      if (operation.type === "save_document") {
        const current =
          revisions.get(operation.noteId)?.revision ??
          state.documents.get(operation.noteId)?.revision ??
          0;
        revisions.set(operation.noteId, { id: operation.noteId, revision: current + 1 });
      }
      const placedId = placedNodeId(operation);
      const placed = placedId === null ? undefined : state.sourceNodes.get(placedId);
      if (placed) {
        rankChanges.set(placed.id, {
          id: placed.id,
          parentId: placed.parentId,
          rank: placed.rank,
        });
      }
    }
    const ack: OperationAck = {
      applied: operations.length,
      revisions: [...revisions.values()],
      rankChanges: [...rankChanges.values()],
    };
    canonical.applyAck(ack);
    return ack;
  }

  function matches(hit: WorkspaceNode, needle: string, markdown: string): SearchHit | null {
    const inTitle = hit.title.toLowerCase().includes(needle);
    const at = markdown.toLowerCase().indexOf(needle);
    if (!inTitle && at === -1) {
      return null;
    }
    const snippet = at === -1 ? "" : markdown.slice(Math.max(0, at - 40), at + needle.length + 40);
    return { noteId: hit.id, title: hit.title, snippet, score: inTitle ? 2 : 1 };
  }

  return {
    bootstrapWorkspace: async () => snapshotFromState(canonical.getState()),

    readWorkspaceDelta: async (ids) => {
      const state = canonical.getState();
      const documents: WorkspaceDocument[] = [];
      const nodes: WorkspaceNode[] = [];
      for (const id of ids) {
        const document = state.documents.get(id);
        if (document) documents.push(documentFromRecord(document));
        const node = state.sourceNodes.get(id);
        if (node) nodes.push(node);
      }
      return { documents, nodes };
    },

    applyWorkspaceOperations: async (envelopes) => {
      validate(envelopes);
      return apply(envelopes.map((envelope) => envelope.operation));
    },

    loadSidebarExpansion: async () => (expandedFolderIds === null ? null : [...expandedFolderIds]),

    saveSidebarExpansion: async (folderIds) => {
      expandedFolderIds = [...folderIds];
    },

    searchWorkspace: async (query, limit, noteIds = null) => {
      const needle = query.trim().toLowerCase();
      if (needle === "") {
        return [];
      }
      const state = canonical.getState();
      const scope = noteIds === null ? null : new Set(noteIds);
      const hits: SearchHit[] = [];
      for (const node of state.sourceNodes.values()) {
        if (node.kind !== "note" || node.deletedAt !== null || (node.lockedAt ?? null) !== null) {
          continue;
        }
        if (scope !== null && !scope.has(node.id)) {
          continue;
        }
        const hit = matches(node, needle, state.documents.get(node.id)?.markdown ?? "");
        if (hit) hits.push(hit);
      }
      hits.sort((left, right) => right.score - left.score || (left.noteId < right.noteId ? -1 : 1));
      return hits.slice(0, limit);
    },

    searchIndexStatus: async () => indexStatus(),

    rebuildSearchIndex: async () => indexStatus(),

    noteLockState: async () => lockState(),

    configureNoteLock: async (input) => {
      if (lock !== null) {
        throw new Error("A note lock is already configured.");
      }
      const recoveryCode = `memory-recovery-${now().toString(36)}`;
      lock = { input, recoveryCode, unlocked: true, failedAttempts: 0 };
      return recoveryCode;
    },

    unlockNoteLock: async (secret) => {
      if (lock === null) {
        throw new Error("No note lock is configured.");
      }
      if (lock.input.secret !== secret) {
        lock = { ...lock, failedAttempts: lock.failedAttempts + 1 };
        throw new Error("The secret does not match the note lock.");
      }
      lock = { ...lock, unlocked: true, failedAttempts: 0 };
      return lockState();
    },

    recoverNoteLock: async (recoveryCode, input) => {
      if (lock === null) {
        throw new Error("No note lock is configured.");
      }
      if (lock.recoveryCode !== recoveryCode) {
        throw new Error("The recovery code does not match the note lock.");
      }
      lock = { ...lock, input, unlocked: true, failedAttempts: 0 };
      return lockState();
    },

    changeNoteLockSecret: async (input) => {
      lock = { ...requireUnlocked(), input };
      return lockState();
    },

    relockNoteLock: async () => {
      if (lock !== null) {
        lock = { ...lock, unlocked: false };
      }
      return lockState();
    },

    readLockedDocuments: async (noteIds = null) => {
      requireUnlocked();
      const state = canonical.getState();
      const scope = noteIds === null ? null : new Set(noteIds);
      const documents: WorkspaceDocument[] = [];
      for (const node of lockedNodes()) {
        const document = state.documents.get(node.id);
        if (document && (scope === null || scope.has(node.id))) {
          documents.push(documentFromRecord(document));
        }
      }
      return documents;
    },

    removeNoteLock: async () => {
      requireUnlocked();
      const at = now();
      const ack = apply(
        lockedNodes().map((node) => ({ type: "set_node_locked", id: node.id, locked: false, at })),
      );
      lock = null;
      return ack;
    },

    storeNoteImage: async (bytes): Promise<StoredImagePayload> => {
      const contentHash = contentKey(bytes);
      blobs.set(contentHash, bytes.slice());
      return { contentHash, mimeType: sniffMimeType(bytes), byteSize: bytes.length };
    },

    readNoteImageBlob: async (contentHash) => {
      const bytes = blobs.get(contentHash);
      if (!bytes) {
        throw new Error(`No stored media for content hash ${contentHash}.`);
      }
      return bytes.slice().buffer;
    },

    workspaceSyncStatus: async () => syncStatus(),

    connectWorkspaceSync: async (token) => {
      if (token === "") {
        return { state: "authenticationRequired" };
      }
      syncConnected = true;
      return syncStatus();
    },

    pauseWorkspaceSync: async () => {
      syncConnected = false;
      return syncStatus();
    },

    retryWorkspaceSync: async () => syncStatus(),

    refreshWorkspaceSync: async () => syncStatus(),

    setWorkspaceSyncOnline: async (online) => {
      syncOnline = online;
    },

    setWorkspaceSyncVisibility: async () => undefined,

    listBlockedSyncOperations: async () => ({ viewVersion: 1, blocked: [], discarded: [] }),

    retryBlockedSyncOperation: async (blockedId) => {
      throw new Error(`No blocked sync operation ${blockedId}.`);
    },

    discardBlockedSyncOperation: async (blockedId) => {
      throw new Error(`No blocked sync operation ${blockedId}.`);
    },

    adoptWorkspaceSlot: async (workspaceId) => {
      if (activeSlot === workspaceId) {
        return "active";
      }
      const adoption = activeSlot === null ? "claimed" : "switched";
      activeSlot = workspaceId;
      return adoption;
    },

    activeWorkspaceSlot: async () => activeSlot,
  };
}
