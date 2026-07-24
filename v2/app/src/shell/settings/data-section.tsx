import { useEffect, useRef, useState } from "react";
import { resetAllSettings } from "../../actions/settings";
import {
  cancelWorkspaceMaintenance,
  createWorkspaceBackup,
  exportWorkspaceArchive,
  importWorkspaceArchive,
  listWorkspaceRecovery,
  pickDirectory,
  relocateWorkspaceStorage,
  restoreWorkspaceBackup,
  revealWorkspaceStorage,
  workspaceStoragePath,
} from "../../bridge/commands";
import { FolderOpenIcon } from "../../shared/icons";
import { Button } from "../../shared/ui/button";
import { InlineConfirm } from "../../shared/ui/inline-confirm";
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
import { cn } from "../../shared/lib/utils";
import {
  SettingsHeading,
  settingsButton,
  settingsGroup,
  settingsGroupTitle,
  settingsInputRow,
  settingsRow,
  settingsRowDescription,
  settingsRowDetail,
  settingsRowLabel,
  settingsSection,
  settingsTextInput,
} from "./settings-shared";
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
  relocate: "Moving workspace…",
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
    if (confirmation.kind === "relocate") {
      relocateWorkspaceStorage(confirmation.targetDir).catch((error) => {
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

  function chooseStorageLocation(): void {
    pickDirectory("Choose a new storage folder")
      .then((picked) => {
        if (!picked) {
          return;
        }
        const next = requestConfirmation(phase, {
          kind: "relocate",
          targetDir: picked,
        });
        if (next) {
          setPhase(next);
        }
      })
      .catch((error) => {
        console.error("storage folder pick rejected", error);
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
    <section aria-label="Data" className={settingsSection}>
      <SettingsHeading
        title="Data"
        detail="Storage, portable archives, backups, and recovery for this workspace."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Storage</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Workspace database
            <span className={settingsRowDetail}>{storagePath ?? "Locating…"}</span>
          </span>
          <button
            type="button"
            className={settingsButton}
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
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Move workspace
            <span className={settingsRowDescription}>
              Copies the database, images, history, and backups to a new folder, then
              restarts the app using it.
            </span>
          </span>
          <InlineConfirm
            confirmLabel={confirmation?.kind === "relocate" && copy ? copy.confirmLabel : "Move and restart"}
            message={confirmation?.kind === "relocate" && copy ? copy.body : null}
            messagePlacement="stacked"
            armed={confirmation?.kind === "relocate"}
            onArmedChange={(next) => {
              if (!next) {
                setPhase((current) => dismissConfirmation(current));
              }
            }}
            onConfirm={runConfirmed}
            renderIdle={() => (
              <button
                type="button"
                className={settingsButton}
                disabled={busy}
                onClick={chooseStorageLocation}
              >
                Change location…
              </button>
            )}
          />
        </div>
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Portable archive</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Export workspace
            <span className={settingsRowDescription}>
              Writes a portable JSON archive into the exports folder next to the database.
            </span>
          </span>
          <button
            type="button"
            className={settingsButton}
            disabled={busy}
            onClick={runExport}
          >
            Export archive
          </button>
        </div>
        <div className={cn(settingsRow, settingsInputRow)}>
          <label className={settingsRowLabel} htmlFor="settings-import-path">
            Import archive
            <span className={settingsRowDescription}>
              Replaces this workspace with a previously exported archive file.
            </span>
          </label>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <input
              id="settings-import-path"
              className={cn(settingsTextInput, "min-w-0 max-w-[320px] flex-1")}
              type="text"
              placeholder="/path/to/skriuw-archive.json"
              value={importPath}
              disabled={busy}
              onChange={(event) => setImportPath(event.currentTarget.value)}
            />
            <InlineConfirm
              confirmLabel={confirmation?.kind === "import" && copy ? copy.confirmLabel : "Replace workspace"}
              message={confirmation?.kind === "import" && copy ? copy.body : null}
              messagePlacement="stacked"
              armed={confirmation?.kind === "import"}
              onArmedChange={(next) => {
                if (!next) {
                  setPhase((current) => dismissConfirmation(current));
                }
              }}
              onConfirm={runConfirmed}
              renderIdle={() => (
                <button
                  type="button"
                  className={settingsButton}
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
              )}
            />
          </div>
        </div>
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Backups</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Scheduled backups
            <span className={settingsRowDescription}>
              The desktop app takes a verified backup every six hours while it runs.
            </span>
          </span>
          <button
            type="button"
            className={settingsButton}
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
          restoringFileName={
            confirmation?.kind === "restore" ? confirmation.artifactFileName : null
          }
          restoreConfirmLabel={confirmation?.kind === "restore" && copy ? copy.confirmLabel : "Restore backup"}
          restoreMessage={confirmation?.kind === "restore" && copy ? copy.body : null}
          onCancelRestore={() => setPhase((current) => dismissConfirmation(current))}
          onConfirmRestore={runConfirmed}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Reset</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Reset all settings
            <span className={settingsRowDescription}>
              Restores appearance, editor, and keyboard shortcut preferences to their
              defaults. Notes and data are not affected.
            </span>
          </span>
          <InlineConfirm
            confirmLabel="Reset settings"
            onConfirm={() => resetAllSettings(store)}
            renderIdle={(arm) => (
              <Button variant="danger" onClick={arm}>
                Reset all settings
              </Button>
            )}
          />
        </div>
      </div>
      <MaintenanceStatus
        phase={phase}
        onCancel={cancelRunning}
        onForceBackup={() => runBackup(true)}
      />
    </section>
  );
}

const backupListClass = "mt-1 list-none rounded-lg border border-border p-0";
const backupItemClass =
  "flex items-center justify-between gap-3 px-2.5 py-2 text-[13px] [&+&]:border-t [&+&]:border-border";

type BackupInventoryProps = {
  inventory: RecoveryViewModel | null;
  failed: boolean;
  busy: boolean;
  onRetry: () => void;
  onRestore: (entry: BackupListEntry) => void;
  restoringFileName: string | null;
  restoreConfirmLabel: string;
  restoreMessage: string | null;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
};

function BackupInventory({
  inventory,
  failed,
  busy,
  onRetry,
  onRestore,
  restoringFileName,
  restoreConfirmLabel,
  restoreMessage,
  onCancelRestore,
  onConfirmRestore,
}: BackupInventoryProps) {
  if (failed) {
    return (
      <div className={cn(settingsRow, "text-destructive")} role="alert">
        <span className={settingsRowLabel}>Backups could not be listed.</span>
        <button type="button" className={settingsButton} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (inventory === null) {
    return (
      <p className={cn(settingsRowDetail, "mt-1")} role="status">
        Loading backups…
      </p>
    );
  }
  if (inventory.empty) {
    return (
      <p className={settingsRowDetail} role="status">
        No backups yet. Use “Back up now” or wait for the next scheduled backup.
      </p>
    );
  }
  return (
    <>
      <ul className={backupListClass} aria-label="Retained backups">
        {inventory.backups.map((entry) => (
          <li key={entry.fileName} className={backupItemClass}>
            <span className={settingsRowLabel}>
              {entry.fileName}
              <span className={settingsRowDetail}>
                {maintenanceTimeFormatter.format(new Date(entry.createdAt))} ·{" "}
                {formatSizeBytes(entry.sizeBytes)}
                {entry.verified ? "" : " · unverified"}
              </span>
            </span>
            <InlineConfirm
              size="sm"
              confirmLabel={restoreConfirmLabel}
              message={restoringFileName === entry.fileName ? restoreMessage : null}
              messagePlacement="stacked"
              armed={restoringFileName === entry.fileName}
              onArmedChange={(next) => {
                if (!next) {
                  onCancelRestore();
                }
              }}
              onConfirm={onConfirmRestore}
              renderIdle={() => (
                <button
                  type="button"
                  className={settingsButton}
                  disabled={busy}
                  onClick={() => onRestore(entry)}
                >
                  Restore…
                </button>
              )}
            />
          </li>
        ))}
      </ul>
      {inventory.rollbacks.length > 0 && (
        <>
          <div className={settingsGroupTitle}>Kept after restores</div>
          <ul className={backupListClass} aria-label="Rollback databases">
            {inventory.rollbacks.map((entry) => (
              <li key={entry.fileName} className={backupItemClass}>
                <span className={settingsRowLabel}>
                  {entry.fileName}
                  <span className={settingsRowDetail}>
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

const maintenanceStatusClass =
  "mb-3.5 flex items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground";

type MaintenanceStatusProps = {
  phase: MaintenancePhase;
  onCancel: () => void;
  onForceBackup: () => void;
};

function MaintenanceStatus({ phase, onCancel, onForceBackup }: MaintenanceStatusProps) {
  if (phase.phase === "running") {
    return (
      <div className={maintenanceStatusClass} role="status">
        <span>{RUNNING_LABELS[phase.kind]}</span>
        <button
          type="button"
          className={settingsButton}
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
      <p className={cn(maintenanceStatusClass, "text-foreground")} role="status">
        {phase.detail}
      </p>
    );
  }
  if (phase.phase === "cancelled") {
    return (
      <p className={maintenanceStatusClass} role="status">
        {RUNNING_LABELS[phase.kind].replace("…", "")} was cancelled. Nothing changed.
      </p>
    );
  }
  if (phase.phase === "notDue") {
    return (
      <div className={maintenanceStatusClass} role="status">
        <span>
          Backup not due yet. Next scheduled backup{" "}
          {maintenanceTimeFormatter.format(new Date(phase.nextDueAt))}.
        </span>
        <button type="button" className={settingsButton} onClick={onForceBackup}>
          Back up anyway
        </button>
      </div>
    );
  }
  if (phase.phase === "error") {
    return (
      <p className={cn(maintenanceStatusClass, "border-destructive/50 text-destructive")} role="alert">
        {phase.message}
      </p>
    );
  }
  return null;
}
