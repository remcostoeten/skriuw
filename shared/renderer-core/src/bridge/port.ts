import type {
  NoteLockKind,
  NoteLockState,
  OperationAck,
  SearchHit,
  SearchIndexStatus,
  WorkspaceDelta,
  WorkspaceDocument,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "../contracts/workspace";

export type WorkspaceSyncStatus =
  | { state: "localOnly" }
  | { state: "connecting" }
  | { state: "upToDate" }
  | { state: "pending" }
  | { state: "offline" }
  | { state: "authenticationRequired" }
  | { state: "rehydrating" }
  | { state: "retrying"; nextAttemptAt: number }
  | { state: "blocked"; reason: string; detail: string | null };

/** Mirrors `SlotAdoption` in `app/src-tauri/src/workspace_slots.rs`. */
export type SlotAdoption = "claimed" | "active" | "switched";

export type BlockedSyncOperation = {
  blockedId: string;
  operationType: string;
  reasonCode: string;
  targetId: string | null;
  targetTitle: string | null;
  assetContentHash: string | null;
  assetMimeType: string | null;
  firstBlockedAt: number;
};

export type DiscardedSyncOperation = {
  blockedId: string;
  operationType: string;
  reasonCode: string;
  targetId: string | null;
  targetTitle: string | null;
  firstBlockedAt: number;
  discardedAt: number;
};

export type SyncRecoveryView = {
  viewVersion: number;
  blocked: BlockedSyncOperation[];
  discarded: DiscardedSyncOperation[];
};

export type StoredImagePayload = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
};

export type NoteLockSecretInput = {
  kind: NoteLockKind;
  secret: string;
  hint: string | null;
};

/**
 * The command subset every runtime implements (`docs/specs/mobile-app.md`,
 * Command surface). Signatures match `app/src/bridge/commands.ts` so the
 * Tauri, browser-worker and native-module bridges are interchangeable.
 * Documents load through the snapshot and delta reads and save as
 * `save_document` operations; journal and task queries are store projections
 * over the same snapshot, and settings travel as `update_settings`.
 */
export type BridgePort = {
  bootstrapWorkspace: () => Promise<WorkspaceSnapshot>;
  readWorkspaceDelta: (ids: readonly string[]) => Promise<WorkspaceDelta>;
  applyWorkspaceOperations: (operations: WorkspaceOperationEnvelope[]) => Promise<OperationAck>;
  loadSidebarExpansion: () => Promise<string[] | null>;
  saveSidebarExpansion: (folderIds: readonly string[]) => Promise<void>;
  searchWorkspace: (
    query: string,
    limit: number,
    noteIds?: readonly string[] | null,
  ) => Promise<SearchHit[]>;
  searchIndexStatus: () => Promise<SearchIndexStatus>;
  rebuildSearchIndex: () => Promise<SearchIndexStatus>;
  noteLockState: () => Promise<NoteLockState>;
  configureNoteLock: (input: NoteLockSecretInput) => Promise<string>;
  unlockNoteLock: (secret: string) => Promise<NoteLockState>;
  recoverNoteLock: (recoveryCode: string, input: NoteLockSecretInput) => Promise<NoteLockState>;
  changeNoteLockSecret: (input: NoteLockSecretInput) => Promise<NoteLockState>;
  relockNoteLock: () => Promise<NoteLockState>;
  removeNoteLock: () => Promise<OperationAck>;
  readLockedDocuments: (noteIds?: readonly string[] | null) => Promise<WorkspaceDocument[]>;
  storeNoteImage: (bytes: Uint8Array) => Promise<StoredImagePayload>;
  readNoteImageBlob: (contentHash: string, mimeType: string) => Promise<ArrayBuffer>;
  workspaceSyncStatus: () => Promise<WorkspaceSyncStatus>;
  connectWorkspaceSync: (token: string, baseUrl: string) => Promise<WorkspaceSyncStatus>;
  pauseWorkspaceSync: () => Promise<WorkspaceSyncStatus>;
  retryWorkspaceSync: () => Promise<WorkspaceSyncStatus>;
  refreshWorkspaceSync: () => Promise<WorkspaceSyncStatus>;
  setWorkspaceSyncOnline: (online: boolean) => Promise<void>;
  setWorkspaceSyncVisibility: (visible: boolean, focused: boolean) => Promise<void>;
  listBlockedSyncOperations: () => Promise<SyncRecoveryView>;
  retryBlockedSyncOperation: (blockedId: string) => Promise<SyncRecoveryView>;
  discardBlockedSyncOperation: (blockedId: string) => Promise<SyncRecoveryView>;
  adoptWorkspaceSlot: (workspaceId: string) => Promise<SlotAdoption>;
  activeWorkspaceSlot: () => Promise<string | null>;
};
