import { useEffect, useRef, useState } from "react";
import {
  cancelWorkspaceMaintenance,
  createWorkspaceBackup,
  exportWorkspaceArchive,
  importWorkspaceArchive,
  listWorkspaceRecovery,
  restoreWorkspaceBackup,
  revealWorkspaceStorage,
  workspaceStoragePath,
} from "../../bridge/commands";
import { FolderOpenIcon } from "../../shared/icons";
import { Dialog } from "../../shared/ui/dialog";
import {
  IDLE_MAINTENANCE,
  backupNotDue,
  beginOperation,
  completeOperation,
  confirmOperation,
  confirmationCopy,
  describeBackupReport,
  describeExportReport,
  describeImportReport,
  describeSwapReport,
  dismissConfirmation,
  failOperation,
  formatSizeBytes,
  isMaintenanceBusy,
  projectRecoveryInventory,
  requestCancel,
  requestConfirmation,
} from "../../settings/maintenance-model";
import type {
  BackupListEntry,
  MaintenanceKind,
  MaintenancePhase,
  RecoveryViewModel,
} from "../../settings/maintenance-model";
import { noop } from "../../shared/lib/noop";
import type { SectionProps } from "./settings-shared";

const maintenanceTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const RUNNING_LABELS: Record<MaintenanceKind, string> = {
  export: "Exporting archive…",
  import: "Importing archive…",
  backup: "Backing up…",
  restore: "Restoring backup…",
};

export function DataSection({ store }: SectionProps) {
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [phase, setPhase] = useState<MaintenancePhase>(IDLE_MAINTENANCE);
  const [importPath, setImportPath] = useState("");
  const [inventory, setInventory] = useState<RecoveryViewModel | null>(null);
  const [inventoryFailed, setInventoryFailed] = useState(false);
  const mountedRef = useRef(true);
  const busy = isMaintenanceBusy(phase);

  function refreshInventory(): void {
    listWorkspaceRecovery()
      .then((report) => {
        if (mountedRef.current) {
          setInventory(projectRecoveryInventory(report));
          setInventoryFailed(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setInventoryFailed(true);
        }
      });
  }

  useEffect(() => {
    mountedRef.current = true;
    workspaceStoragePath()
      .then((path) => {
        if (mountedRef.current) {
          setStoragePath(path);
        }
      })
      .catch((error) => {
        console.error("storage path lookup rejected", error);
      });
    refreshInventory();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function finish(update: (current: MaintenancePhase) => MaintenancePhase): void {
    if (mountedRef.current) {
      setPhase(update);
    }
  }

  function runExport(): void {
    const next = beginOperation(phase, "export");
    if (!next) {
      return;
    }
    setPhase(next);
    exportWorkspaceArchive()
      .then((report) => {
        finish((current) => completeOperation(current, describeExportReport(report)));
      })
      .catch((error) => {
        finish((current) => failOperation(current, String(error)));
      });
  }

  function runBackup(force: boolean): void {
    const next = beginOperation(phase, "backup");
    if (!next) {
      return;
    }
    setPhase(next);
    createWorkspaceBackup(force)
      .then((report) => {
        const outcome = describeBackupReport(report);
        finish((current) =>
          outcome.created
            ? completeOperation(current, outcome.detail)
            : backupNotDue(current, outcome.nextDueAt),
        );
        if (outcome.created) {
          refreshInventory();
        }
      })
      .catch((error) => {
        finish((current) => failOperation(current, String(error)));
      });
  }

  function runConfirmed(): void {
    if (phase.phase !== "confirming") {
      return;
    }
    const confirmation = phase.confirmation;
    const next = confirmOperation(phase);
    if (!next) {
      return;
    }
    setPhase(next);
    if (confirmation.kind === "import") {
      importWorkspaceArchive(confirmation.archivePath)
        .then((report) => {
          store.replaceFromSnapshot(report.snapshot);
          finish((current) => completeOperation(current, describeImportReport(report)));
          setImportPath("");
          refreshInventory();
        })
        .catch((error) => {
          finish((current) => failOperation(current, String(error)));
        });
      return;
    }
    restoreWorkspaceBackup(confirmation.artifactFileName)
      .then((report) => {
        const outcome = describeSwapReport(report);
        store.replaceFromSnapshot(report.snapshot);
        finish((current) =>
          outcome.restored
            ? completeOperation(current, outcome.detail)
            : failOperation(current, outcome.detail),
        );
        refreshInventory();
      })
      .catch((error) => {
        finish((current) => failOperation(current, String(error)));
      });
  }

  function cancelRunning(): void {
    setPhase((current) => requestCancel(current));
    cancelWorkspaceMaintenance().catch(() => {
      noop();
    });
  }

  const confirmation = phase.phase === "confirming" ? phase.confirmation : null;
  const copy = confirmation ? confirmationCopy(confirmation) : null;

  return (
    <section aria-label="Data">
      <div className="settings-section-heading">
        <h1>Data</h1>
        <p>Storage, portable archives, backups, and recovery for this workspace.</p>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Storage</div>
        <div className="settings-row">
          <span className="settings-row-label">
            Workspace database
            <span className="settings-row-detail">{storagePath ?? "Locating…"}</span>
          </span>
          <button
            type="button"
            className="settings-button"
            onClick={() => {
              revealWorkspaceStorage().catch((error) => {
                console.error("reveal storage rejected", error);
              });
            }}
          >
            <FolderOpenIcon size={15} />
            Show in file manager
          </button>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Portable archive</div>
        <div className="settings-row">
          <span className="settings-row-label">
            Export workspace
            <span className="settings-row-description">
              Writes a portable JSON archive into the exports folder next to the database.
            </span>
          </span>
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={runExport}
          >
            Export archive
          </button>
        </div>
        <div className="settings-row settings-input-row">
          <label className="settings-row-label" htmlFor="settings-import-path">
            Import archive
            <span className="settings-row-description">
              Replaces this workspace with a previously exported archive file.
            </span>
          </label>
          <div className="settings-inline-controls">
            <input
              id="settings-import-path"
              className="settings-text-input"
              type="text"
              placeholder="/path/to/skriuw-archive.json"
              value={importPath}
              disabled={busy}
              onChange={(event) => setImportPath(event.currentTarget.value)}
            />
            <button
              type="button"
              className="settings-button"
              disabled={busy || importPath.trim() === ""}
              onClick={() => {
                const next = requestConfirmation(phase, {
                  kind: "import",
                  archivePath: importPath.trim(),
                });
                if (next) {
                  setPhase(next);
                }
              }}
            >
              Import…
            </button>
          </div>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Backups</div>
        <div className="settings-row">
          <span className="settings-row-label">
            Scheduled backups
            <span className="settings-row-description">
              The desktop app takes a verified backup every six hours while it runs.
            </span>
          </span>
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={() => runBackup(false)}
          >
            Back up now
          </button>
        </div>
        <BackupInventory
          inventory={inventory}
          failed={inventoryFailed}
          busy={busy}
          onRetry={refreshInventory}
          onRestore={(entry) => {
            const next = requestConfirmation(phase, {
              kind: "restore",
              artifactFileName: entry.fileName,
              createdAt: entry.createdAt,
            });
            if (next) {
              setPhase(next);
            }
          }}
        />
      </div>
      <MaintenanceStatus
        phase={phase}
        onCancel={cancelRunning}
        onForceBackup={() => runBackup(true)}
      />
      {confirmation && copy && (
        <Dialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPhase((current) => dismissConfirmation(current));
            }
          }}
          title={copy.title}
          className="max-w-[420px]"
        >
          <p className="mb-3.5 text-[13px] leading-normal">{copy.body}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="settings-button"
              onClick={() => setPhase((current) => dismissConfirmation(current))}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-button settings-button-danger"
              onClick={runConfirmed}
            >
              {copy.confirmLabel}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

type BackupInventoryProps = {
  inventory: RecoveryViewModel | null;
  failed: boolean;
  busy: boolean;
  onRetry: () => void;
  onRestore: (entry: BackupListEntry) => void;
};

function BackupInventory({
  inventory,
  failed,
  busy,
  onRetry,
  onRestore,
}: BackupInventoryProps) {
  if (failed) {
    return (
      <div className="settings-row settings-maintenance-error" role="alert">
        <span className="settings-row-label">Backups could not be listed.</span>
        <button type="button" className="settings-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (inventory === null) {
    return (
      <p className="settings-row-detail settings-maintenance-loading" role="status">
        Loading backups…
      </p>
    );
  }
  if (inventory.empty) {
    return (
      <p className="settings-row-detail" role="status">
        No backups yet. Use “Back up now” or wait for the next scheduled backup.
      </p>
    );
  }
  return (
    <>
      <ul className="settings-backup-list" aria-label="Retained backups">
        {inventory.backups.map((entry) => (
          <li key={entry.fileName} className="settings-backup-item">
            <span className="settings-row-label">
              {entry.fileName}
              <span className="settings-row-detail">
                {maintenanceTimeFormatter.format(new Date(entry.createdAt))} ·{" "}
                {formatSizeBytes(entry.sizeBytes)}
                {entry.verified ? "" : " · unverified"}
              </span>
            </span>
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => onRestore(entry)}
            >
              Restore…
            </button>
          </li>
        ))}
      </ul>
      {inventory.rollbacks.length > 0 && (
        <>
          <div className="settings-group-title">Kept after restores</div>
          <ul className="settings-backup-list" aria-label="Rollback databases">
            {inventory.rollbacks.map((entry) => (
              <li key={entry.fileName} className="settings-backup-item">
                <span className="settings-row-label">
                  {entry.fileName}
                  <span className="settings-row-detail">
                    {maintenanceTimeFormatter.format(new Date(entry.createdAt))} ·{" "}
                    {formatSizeBytes(entry.sizeBytes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

type MaintenanceStatusProps = {
  phase: MaintenancePhase;
  onCancel: () => void;
  onForceBackup: () => void;
};

function MaintenanceStatus({ phase, onCancel, onForceBackup }: MaintenanceStatusProps) {
  if (phase.phase === "running") {
    return (
      <div className="settings-maintenance-status" role="status">
        <span>{RUNNING_LABELS[phase.kind]}</span>
        <button
          type="button"
          className="settings-button"
          disabled={phase.cancelRequested}
          onClick={onCancel}
        >
          {phase.cancelRequested ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    );
  }
  if (phase.phase === "success") {
    return (
      <p className="settings-maintenance-status is-success" role="status">
        {phase.detail}
      </p>
    );
  }
  if (phase.phase === "cancelled") {
    return (
      <p className="settings-maintenance-status" role="status">
        {RUNNING_LABELS[phase.kind].replace("…", "")} was cancelled. Nothing changed.
      </p>
    );
  }
  if (phase.phase === "notDue") {
    return (
      <div className="settings-maintenance-status" role="status">
        <span>
          Backup not due yet. Next scheduled backup{" "}
          {maintenanceTimeFormatter.format(new Date(phase.nextDueAt))}.
        </span>
        <button type="button" className="settings-button" onClick={onForceBackup}>
          Back up anyway
        </button>
      </div>
    );
  }
  if (phase.phase === "error") {
    return (
      <p className="settings-maintenance-status is-error" role="alert">
        {phase.message}
      </p>
    );
  }
  return null;
}
