import { useEffect, useRef, useState } from "react";
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
  pickImportFile,
  workspaceStoragePath,
} from "../../bridge/commands";
import {
  importMarkdownIntoWorkspace,
  importProviderExportIntoWorkspace,
} from "../../export/markdown-transfer";
import { FolderOpenIcon, UploadIcon } from "../../shared/icons";
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
import { isBrowserRuntime } from "../../bridge/runtime";
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
  settingsButtonDanger,
  settingsRowDetail,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

const maintenanceTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const dangerZoneClass =
  "rounded-lg border border-destructive/25 px-3 pb-1 pt-2.5";

const RUNNING_LABELS: Record<MaintenanceKind, string> = {
  export: "Exporting archive…",
  import: "Importing archive…",
  backup: "Backing up…",
  restore: "Restoring backup…",
  relocate: "Moving workspace…",
};

export function DataSection({ store }: SectionProps) {
  const browser = isBrowserRuntime();
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
    if (!browser) {
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
    }
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

  function chooseArchiveFile(): void {
    pickImportFile("Choose a workspace archive")
      .then((picked) => {
        if (picked && mountedRef.current) {
          setImportPath(picked);
        }
      })
      .catch((error) => {
        console.error("archive pick rejected", error);
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
    <section aria-label="Data and recovery" className={settingsSection}>
      <SettingsHeading
        title="Data & recovery"
        detail="Imports, storage, portable archives, backups, and recovery for this workspace."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Storage</div>
        {browser && (
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              Workspace database
              <span className={settingsRowDescription}>
                Stored durably in this browser&rsquo;s private site storage (OPFS) on
                this device. Clearing site data for this origin deletes it, so keep a
                recent exported archive outside the browser.
              </span>
            </span>
          </div>
        )}
        {!browser && (
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
        )}
        {!browser && (
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Move workspace
            <span className={settingsRowDescription}>
              Copies the database, images, history, and backups to a new folder, then
              restarts the app using it.
            </span>
          </span>
          <InlineConfirm
            className="shrink-0"
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
        )}
      </div>
      {!browser && (
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Import & export</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Import notes from a folder
            <span className={settingsRowDescription}>
              Markdown, text, Obsidian vaults, extracted Notion exports, or
              TextBundles. Shows a preview before anything changes.
            </span>
          </span>
          <button
            type="button"
            className={settingsButton}
            disabled={busy}
            onClick={() => {
              void importMarkdownIntoWorkspace(store);
            }}
          >
            <UploadIcon size={15} />
            Choose folder…
          </button>
        </div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Import a provider export
            <span className={settingsRowDescription}>
              ZIP, Evernote ENEX, Joplin, Google Keep, Standard Notes, Bear
              .bear2bk, Simplenote JSON, Notion CSV, Markdown, or text files.
              Shows a preview before anything changes.
            </span>
          </span>
          <button
            type="button"
            className={settingsButton}
            disabled={busy}
            onClick={() => {
              void importProviderExportIntoWorkspace(store);
            }}
          >
            <UploadIcon size={15} />
            Choose file…
          </button>
        </div>
      </div>
      )}
      <div className={settingsGroup}>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Export workspace
            <span className={settingsRowDescription}>
              {browser
                ? "Downloads a portable JSON archive of this workspace."
                : "Writes a portable JSON archive into the exports folder next to the database."}
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
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Backups & recovery</div>
        {browser && (
          <p className={settingsRowDetail} role="note">
            Verified scheduled backups run in the desktop app. In the browser, an
            exported archive is the backup: download one regularly and keep it
            outside this browser.
          </p>
        )}
        {!browser && (
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
        )}
        {!browser && (
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
        )}
      </div>
      <div className={cn(settingsGroup, dangerZoneClass)}>
        <div className={cn(settingsGroupTitle, "text-destructive/80")}>Danger zone</div>
        <div className={cn(settingsRow, settingsInputRow)}>
          <span className={settingsRowLabel}>
            Replace workspace from archive
            <span className={settingsRowDescription}>
              Replaces every note in this workspace with the contents of a previously
              exported archive file.
              {browser
                ? " A safety copy of the current workspace is downloaded first."
                : ""}
            </span>
            {importPath !== "" && (
              <span className={settingsRowDetail}>{importPath}</span>
            )}
          </span>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              className={settingsButton}
              disabled={busy}
              onClick={chooseArchiveFile}
            >
              Choose archive…
            </button>
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
                  className={cn(settingsButton, settingsButtonDanger)}
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
                  Replace…
                </button>
              )}
            />
          </div>
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
const backupToggleClass =
  "w-full border-t border-border px-2.5 py-1.5 text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground";

const BACKUP_PREVIEW_COUNT = 4;

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
  const [showAllBackups, setShowAllBackups] = useState(false);
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
  const armedBeyondPreview =
    restoringFileName !== null &&
    inventory.backups
      .slice(BACKUP_PREVIEW_COUNT)
      .some((entry) => entry.fileName === restoringFileName);
  const visibleBackups =
    showAllBackups || armedBeyondPreview
      ? inventory.backups
      : inventory.backups.slice(0, BACKUP_PREVIEW_COUNT);
  const hiddenCount = inventory.backups.length - BACKUP_PREVIEW_COUNT;
  return (
    <>
      <ul className={backupListClass} aria-label="Retained backups">
        {visibleBackups.map((entry) => (
          <li key={entry.fileName} className={backupItemClass}>
            <span className={settingsRowLabel}>
              {maintenanceTimeFormatter.format(new Date(entry.createdAt))}
              <span className={settingsRowDetail}>
                {entry.fileName} · {formatSizeBytes(entry.sizeBytes)}
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
        {hiddenCount > 0 && (
          <li>
            <button
              type="button"
              className={backupToggleClass}
              aria-expanded={showAllBackups}
              onClick={() => setShowAllBackups((current) => !current)}
            >
              {showAllBackups
                ? "Show fewer"
                : `Show ${hiddenCount} more ${hiddenCount === 1 ? "backup" : "backups"}`}
            </button>
          </li>
        )}
      </ul>
      {inventory.rollbacks.length > 0 && (
        <>
          <div className={settingsGroupTitle}>Kept after restores</div>
          <ul className={backupListClass} aria-label="Rollback databases">
            {inventory.rollbacks.map((entry) => (
              <li key={entry.fileName} className={backupItemClass}>
                <span className={settingsRowLabel}>
                  {maintenanceTimeFormatter.format(new Date(entry.createdAt))}
                  <span className={settingsRowDetail}>
                    {entry.fileName} · {formatSizeBytes(entry.sizeBytes)}
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
