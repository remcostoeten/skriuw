import { invoke } from "./runtime";
import type {
  OperationAck,
  SearchHit,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "@/contracts/workspace";

export type HistoryVersionContent = {
  noteId: string;
  versionId: string;
  createdAt: number;
  summary: string;
  revision: number;
  markdown: string;
};

export type BrowserStorageCapabilities = {
  opfs: boolean;
  crossOriginIsolated: boolean;
};

export function browserStorageCapabilities(): Promise<BrowserStorageCapabilities> {
  return invoke<BrowserStorageCapabilities>("browser_storage_capabilities");
}

export function bootstrapWorkspace(): Promise<WorkspaceSnapshot> {
  return invoke<WorkspaceSnapshot>("bootstrap_workspace");
}

export function loadSidebarExpansion(): Promise<string[] | null> {
  return invoke<string[] | null>("load_sidebar_expansion");
}

export function saveSidebarExpansion(folderIds: readonly string[]): Promise<void> {
  return invoke<void>("save_sidebar_expansion", { folderIds });
}

export function loadPaneLayout(): Promise<string | null> {
  return invoke<string | null>("load_pane_layout");
}

export function savePaneLayout(layoutJson: string): Promise<void> {
  return invoke<void>("save_pane_layout", { layoutJson });
}

export function applyWorkspaceOperations(
  operations: WorkspaceOperationEnvelope[],
): Promise<OperationAck> {
  return invoke<OperationAck>("apply_workspace_operations", { operations });
}

export function closeWorkspaceWindow(): Promise<void> {
  return invoke<void>("close_workspace_window");
}

export function loadAuthToken(): Promise<string | null> {
  return invoke<string | null>("load_auth_token");
}

export function storeAuthToken(token: string): Promise<void> {
  return invoke<void>("store_auth_token", { token });
}

export function clearAuthToken(): Promise<void> {
  return invoke<void>("clear_auth_token");
}

export type WorkspaceSyncStatus =
  | { state: "localOnly" }
  | { state: "connecting" }
  | { state: "upToDate" }
  | { state: "pending" }
  | { state: "offline" }
  | { state: "authenticationRequired" }
  | { state: "conflict"; openConflicts: number }
  | { state: "retrying"; nextAttemptAt: number }
  | { state: "blocked"; reason: string };

export function workspaceSyncStatus(): Promise<WorkspaceSyncStatus> {
  return invoke<WorkspaceSyncStatus>("workspace_sync_status");
}

export function connectWorkspaceSync(token: string): Promise<WorkspaceSyncStatus> {
  return invoke<WorkspaceSyncStatus>("connect_workspace_sync", { token });
}

export function pauseWorkspaceSync(): Promise<WorkspaceSyncStatus> {
  return invoke<WorkspaceSyncStatus>("disconnect_workspace_sync");
}

export function retryWorkspaceSync(): Promise<WorkspaceSyncStatus> {
  return invoke<WorkspaceSyncStatus>("retry_workspace_sync");
}

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

export function listBlockedSyncOperations(): Promise<SyncRecoveryView> {
  return invoke<SyncRecoveryView>("list_blocked_sync_operations");
}

export function retryBlockedSyncOperation(blockedId: string): Promise<SyncRecoveryView> {
  return invoke<SyncRecoveryView>("retry_blocked_sync_operation", { blockedId });
}

export function discardBlockedSyncOperation(blockedId: string): Promise<SyncRecoveryView> {
  return invoke<SyncRecoveryView>("discard_blocked_sync_operation", { blockedId });
}

export function searchWorkspace(query: string, limit: number): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_workspace", { query, limit });
}

export function readHistoryVersion(
  noteId: string,
  versionId: string,
): Promise<HistoryVersionContent> {
  return invoke<HistoryVersionContent>("read_history_version", { noteId, versionId });
}

export function workspaceStoragePath(): Promise<string> {
  return invoke<string>("workspace_storage_path");
}

export function revealWorkspaceStorage(): Promise<void> {
  return invoke<void>("reveal_workspace_storage");
}

export function revealWorkspaceImages(): Promise<void> {
  return invoke<void>("reveal_workspace_images");
}

export function relocateWorkspaceStorage(targetDir: string): Promise<void> {
  return invoke<void>("relocate_workspace_storage", { targetDir });
}

export function clearAllData(): Promise<void> {
  return invoke<void>("clear_all_data");
}

export { openExternalUrl } from "./external-links";

export type ArchiveExportReport = {
  nodes: number;
  documents: number;
  images: number;
  exportedAt: number;
  fileName: string;
};

export type ArchiveImportReport = {
  nodes: number;
  documents: number;
  images: number;
  safetyBackupFileName: string;
  snapshot: WorkspaceSnapshot;
};

export type BackupRotationReport = {
  status: "created" | "skipped";
  artifactFileName: string | null;
  pruned: number;
  nextDueAt: number | null;
};

export type RecoveryArtifact = {
  filename: string;
  createdAt: number;
  sizeBytes: number;
  sha256: string;
  schemaVersion: number;
  migrationFingerprint: string;
  verified: boolean;
};

export type RecoveryInventory = {
  manifest: {
    manifestVersion: number;
    generatedAt: number;
    policy: { cadenceMs: number; maxArtifacts: number; maxAgeMs: number };
    artifacts: RecoveryArtifact[];
    pendingDeletions: RecoveryArtifact[];
  } | null;
  rollbacks: {
    fileName: string;
    createdAt: number;
    sizeBytes: number;
  }[];
};

export type DatabaseSwapReport = {
  status: "replaced" | "rolledBack";
  snapshot: WorkspaceSnapshot;
  rollbackFileName: string | null;
  failure: string | null;
};

export function exportWorkspaceArchive(): Promise<ArchiveExportReport> {
  return invoke<ArchiveExportReport>("export_workspace_archive");
}

export function importWorkspaceArchive(
  archivePath: string,
): Promise<ArchiveImportReport> {
  return invoke<ArchiveImportReport>("import_workspace_archive", { archivePath });
}

export function createWorkspaceBackup(force: boolean): Promise<BackupRotationReport> {
  return invoke<BackupRotationReport>("create_workspace_backup", { force });
}

export function listWorkspaceRecovery(): Promise<RecoveryInventory> {
  return invoke<RecoveryInventory>("list_workspace_recovery");
}

export function restoreWorkspaceBackup(
  artifactFileName: string,
): Promise<DatabaseSwapReport> {
  return invoke<DatabaseSwapReport>("restore_workspace_backup", { artifactFileName });
}

export function cancelWorkspaceMaintenance(): Promise<boolean> {
  return invoke<boolean>("cancel_workspace_maintenance");
}

export type MarkdownExportEntryPayload = {
  relativePath: string;
  kind: "folder" | "note" | "image";
  markdown: string | null;
  contentHash?: string;
  mimeType?: string;
};

export type MarkdownTreePayload = {
  directories: string[];
  files: { relativePath: string; content: string }[];
  assets: string[];
  unsupported: string[];
  skipped: number;
};

export function pickDirectory(title: string): Promise<string | null> {
  return invoke<string | null>("pick_directory", { title });
}

export function pickImportFile(
  title: string,
  extensions?: readonly string[],
): Promise<string | null> {
  return invoke<string | null>("pick_import_file", { title, extensions });
}

export function pickImportFiles(title: string): Promise<string[]> {
  return invoke<string[]>("pick_import_files", { title });
}

export function exportMarkdownTree(
  entries: MarkdownExportEntryPayload[],
  targetDir: string,
): Promise<void> {
  return invoke<void>("export_markdown_tree", { entries, targetDir });
}

export function readMarkdownTree(sourceDir: string): Promise<MarkdownTreePayload> {
  return invoke<MarkdownTreePayload>("read_markdown_tree", { sourceDir });
}

export type PreparedImportSourcePayload = {
  rootPath: string;
  temporary: boolean;
  tree: MarkdownTreePayload;
};

export function prepareImportSource(
  sourcePath: string,
): Promise<PreparedImportSourcePayload> {
  return invoke<PreparedImportSourcePayload>("prepare_import_source", {
    sourcePath,
  });
}

export function prepareImportSources(
  sourcePaths: string[],
): Promise<PreparedImportSourcePayload> {
  return invoke<PreparedImportSourcePayload>("prepare_import_sources", {
    sourcePaths,
  });
}

export function cleanupImportSource(rootPath: string): Promise<void> {
  return invoke<void>("cleanup_import_source", { rootPath });
}

export type StoredImagePayload = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
};

export function storeNoteImage(bytes: Uint8Array): Promise<StoredImagePayload> {
  return invoke<StoredImagePayload>("store_note_image", bytes);
}

/**
 * Downloads a remote image and stores it as a workspace blob. Only the desktop
 * shell can do this: the renderer's content policy forbids requests to
 * arbitrary hosts, and notes never load remote media directly.
 */
export function downloadRemoteMedia(url: string): Promise<StoredImagePayload> {
  return invoke<StoredImagePayload>("download_remote_media", { url });
}

export function readNoteImageBlob(
  contentHash: string,
  mimeType: string,
): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_note_image_blob", { contentHash, mimeType });
}

export type MediaBlobPayload = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
  modifiedAtMs: number;
};

export function listMediaBlobs(): Promise<MediaBlobPayload[]> {
  return invoke<MediaBlobPayload[]>("list_media_blobs");
}

export function deleteMediaBlob(contentHash: string, mimeType: string): Promise<void> {
  return invoke<void>("delete_media_blob", { contentHash, mimeType });
}

/**
 * `liveContentHashes` is only consulted by the browser runtime, which has no
 * database-side view of attachments; the desktop backend derives the live
 * set from its own images table and ignores the argument.
 */
export function sweepUnusedMediaBlobs(
  liveContentHashes: readonly string[],
): Promise<number> {
  return invoke<number>("sweep_unused_media_blobs", { liveContentHashes });
}

export function noteMediaPath(contentHash: string, mimeType: string): Promise<string> {
  return invoke<string>("note_media_path", { contentHash, mimeType });
}

export function importMarkdownImage(
  sourceDir: string,
  relativePath: string,
): Promise<StoredImagePayload> {
  return invoke<StoredImagePayload>("import_markdown_image", { sourceDir, relativePath });
}
