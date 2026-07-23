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

export function applyWorkspaceOperations(
  operations: WorkspaceOperationEnvelope[],
): Promise<OperationAck> {
  return invoke<OperationAck>("apply_workspace_operations", { operations });
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
