import type {
  ArchiveExportReport,
  ArchiveImportReport,
  BackupRotationReport,
  DatabaseSwapReport,
  RecoveryInventory,
} from "../bridge/commands";

export type MaintenanceKind = "export" | "import" | "backup" | "restore" | "relocate";

export type MaintenanceConfirmation =
  | { kind: "import"; archivePath: string }
  | { kind: "restore"; artifactFileName: string; createdAt: number }
  | { kind: "relocate"; targetDir: string };

export type MaintenancePhase =
  | { phase: "idle" }
  | { phase: "confirming"; confirmation: MaintenanceConfirmation }
  | { phase: "running"; kind: MaintenanceKind; cancelRequested: boolean }
  | { phase: "success"; kind: MaintenanceKind; detail: string }
  | { phase: "cancelled"; kind: MaintenanceKind }
  | { phase: "notDue"; nextDueAt: number }
  | { phase: "error"; kind: MaintenanceKind; message: string };

export const IDLE_MAINTENANCE: MaintenancePhase = { phase: "idle" };

export function isMaintenanceBusy(state: MaintenancePhase): boolean {
  return state.phase === "running" || state.phase === "confirming";
}

export function beginOperation(
  state: MaintenancePhase,
  kind: MaintenanceKind,
): MaintenancePhase | null {
  if (isMaintenanceBusy(state)) {
    return null;
  }
  return { phase: "running", kind, cancelRequested: false };
}

export function requestConfirmation(
  state: MaintenancePhase,
  confirmation: MaintenanceConfirmation,
): MaintenancePhase | null {
  if (isMaintenanceBusy(state)) {
    return null;
  }
  return { phase: "confirming", confirmation };
}

export function confirmOperation(state: MaintenancePhase): MaintenancePhase | null {
  if (state.phase !== "confirming") {
    return null;
  }
  return { phase: "running", kind: state.confirmation.kind, cancelRequested: false };
}

export function dismissConfirmation(state: MaintenancePhase): MaintenancePhase {
  return state.phase === "confirming" ? IDLE_MAINTENANCE : state;
}

export function requestCancel(state: MaintenancePhase): MaintenancePhase {
  if (state.phase !== "running") {
    return state;
  }
  return { ...state, cancelRequested: true };
}

export function completeOperation(
  state: MaintenancePhase,
  detail: string,
): MaintenancePhase {
  if (state.phase !== "running") {
    return state;
  }
  return { phase: "success", kind: state.kind, detail };
}

export function failOperation(
  state: MaintenancePhase,
  message: string,
): MaintenancePhase {
  if (state.phase !== "running") {
    return state;
  }
  if (state.cancelRequested) {
    return { phase: "cancelled", kind: state.kind };
  }
  return { phase: "error", kind: state.kind, message };
}

export function backupNotDue(
  state: MaintenancePhase,
  nextDueAt: number,
): MaintenancePhase {
  if (state.phase !== "running") {
    return state;
  }
  return { phase: "notDue", nextDueAt };
}

export function describeExportReport(report: ArchiveExportReport): string {
  return `Exported ${report.nodes} item(s), ${report.documents} document(s), and ${report.images} image(s) to ${report.fileName} in the exports folder.`;
}

export function describeImportReport(report: ArchiveImportReport): string {
  return `Imported ${report.nodes} item(s), ${report.documents} document(s), and ${report.images} image(s). The previous database was kept as ${report.safetyBackupFileName}.`;
}

export function describeBackupReport(
  report: BackupRotationReport,
): { created: true; detail: string } | { created: false; nextDueAt: number } {
  if (report.status === "created") {
    const pruned =
      report.pruned > 0 ? ` ${report.pruned} old backup(s) were pruned.` : "";
    return {
      created: true,
      detail: `Backup ${report.artifactFileName ?? "created"} was written and verified.${pruned}`,
    };
  }
  return { created: false, nextDueAt: report.nextDueAt ?? 0 };
}

export function describeSwapReport(
  report: DatabaseSwapReport,
): { restored: boolean; detail: string } {
  if (report.status === "replaced") {
    const rollback = report.rollbackFileName
      ? ` The replaced database is kept as ${report.rollbackFileName}.`
      : "";
    return { restored: true, detail: `Backup restored.${rollback}` };
  }
  const failure = report.failure ? ` ${report.failure}.` : "";
  return {
    restored: false,
    detail: `Restore verification failed and the previous workspace was kept.${failure}`,
  };
}

export function confirmationCopy(confirmation: MaintenanceConfirmation): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  if (confirmation.kind === "import") {
    return {
      title: "Replace workspace from archive",
      body: "Importing replaces every note, folder, and setting in this workspace with the archive contents. A safety backup of the current database is created first.",
      confirmLabel: "Replace workspace",
    };
  }
  if (confirmation.kind === "relocate") {
    return {
      title: "Move workspace storage",
      body: `The database, images, history, and backups are copied to ${confirmation.targetDir}, then the app restarts using the new location. The current folder is kept untouched as a fallback.`,
      confirmLabel: "Move and restart",
    };
  }
  return {
    title: "Restore backup",
    body: `Restoring replaces the current workspace database with ${confirmation.artifactFileName}. The replaced database is retained as a rollback file.`,
    confirmLabel: "Restore backup",
  };
}

export type BackupListEntry = {
  fileName: string;
  createdAt: number;
  sizeBytes: number;
  verified: boolean;
};

export type RecoveryViewModel = {
  backups: BackupListEntry[];
  rollbacks: BackupListEntry[];
  empty: boolean;
};

export function projectRecoveryInventory(
  inventory: RecoveryInventory,
): RecoveryViewModel {
  const backups = (inventory.manifest?.artifacts ?? [])
    .map((artifact) => ({
      fileName: artifact.filename,
      createdAt: artifact.createdAt,
      sizeBytes: artifact.sizeBytes,
      verified: artifact.verified,
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
  const rollbacks = inventory.rollbacks.map((rollback) => ({
    fileName: rollback.fileName,
    createdAt: rollback.createdAt,
    sizeBytes: rollback.sizeBytes,
    verified: true,
  }));
  return {
    backups,
    rollbacks,
    empty: backups.length === 0 && rollbacks.length === 0,
  };
}

export function formatSizeBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
