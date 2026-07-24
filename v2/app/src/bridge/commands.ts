import { invoke } from "@tauri-apps/api/core";
import type {
  OperationAck,
  SearchHit,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "../contracts/workspace";

export type HistoryVersionContent = {
  noteId: string;
  versionId: string;
  createdAt: number;
  summary: string;
  revision: number;
  markdown: string;
};

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

export function openExternalUrl(url: string): Promise<void> {
  return invoke<void>("open_external_url", { url });
}

export type ArchiveExportReport = {
  nodes: number;
  documents: number;
  exportedAt: number;
  fileName: string;
};

export type ArchiveImportReport = {
  nodes: number;
  documents: number;
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
  skipped: number;
};

export function pickDirectory(title: string): Promise<string | null> {
  return invoke<string | null>("pick_directory", { title });
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

export type StoredImagePayload = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
};

export function storeNoteImage(bytes: Uint8Array): Promise<StoredImagePayload> {
  return invoke<StoredImagePayload>("store_note_image", bytes);
}

export function readNoteImageBlob(
  contentHash: string,
  mimeType: string,
): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_note_image_blob", { contentHash, mimeType });
}

export function importMarkdownImage(
  sourceDir: string,
  relativePath: string,
): Promise<StoredImagePayload> {
  return invoke<StoredImagePayload>("import_markdown_image", { sourceDir, relativePath });
}
