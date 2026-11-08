import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  cancelWorkspaceMaintenance,
  clearAllData,
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
} from "@/platform/runtime/commands";
import { clearSkriuwLocalState } from "@/platform/browser/local-state";
import {
  importMarkdownIntoWorkspace,
  importProviderExportIntoWorkspace,
} from "@/features/transfer/actions";
import { DownloadIcon, FolderOpenIcon, UploadIcon } from "@/shared/icons/static";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { formatSizeBytes } from "@/shared/format/bytes";
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
  isMaintenanceBusy,
  maintenanceKind,
  projectRecoveryInventory,
  requestCancel,
  requestConfirmation,
} from "@/features/settings-dialog/data/maintenance-model";
import type {
  BackupListEntry,
  MaintenanceKind,
  MaintenancePhase,
  RecoveryViewModel,
} from "@/features/settings-dialog/data/maintenance-model";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import {
  installOffered,
  promptInstall,
  subscribeInstallOffer,
} from "@/platform/browser/install-prompt";
import { noop } from "@skriuw/shared/helpers/noop";
import { cn } from "@/shared/styling/class-names";
import {
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsInputRow,
  settingsRow,
  settingsButtonDanger,
  settingsRowDetail,
  settingsRowLabel,
  settingsSection,
  settingsSubheading,
} from "@/shared/ui/settings-controls";
import { EmptyNotesRow } from "@/features/settings-dialog/data/empty-notes-row";
import { useEditableSettings } from "@/features/settings/use-editable-settings";
import type { SectionProps } from "@/features/settings-dialog/sections";
import { Select } from "@/shared/ui/select";
import { REMOTE_IMPORT_IMAGE_OPTIONS } from "@/features/settings/settings-model";

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
  const browser = isBrowserRuntime();
  const { settings, change, changed } = useEditableSettings(store);
  const installable = useSyncExternalStore(subscribeInstallOffer, installOffered, () => false);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [phase, setPhase] = useState<MaintenancePhase>(IDLE_MAINTENANCE);
  const [importPath, setImportPath] = useState("");
  const [inventory, setInventory] = useState<RecoveryViewModel | null>(null);
  const [inventoryFailed, setInventoryFailed] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const clearRequestedRef = useRef(false);
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
          console.error(settingsCopy.data.storagePathLookupRejected, error);
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
    pickImportFile(settingsCopy.data.chooseAWorkspaceArchive)
      .then((picked) => {
        if (picked && mountedRef.current) {
          setImportPath(picked);
        }
      })
      .catch((error) => {
        console.error(settingsCopy.data.archivePickRejected, error);
      });
  }

  function chooseStorageLocation(): void {
    pickDirectory(settingsCopy.data.chooseANewStorageFolder)
      .then((picked) => {
        if (!picked) {
          return;
        }
        const confirmation = requestConfirmation(phase, {
          kind: "relocate",
          targetDir: picked,
        });
        if (confirmation) {
          setPhase(confirmation);
        }
      })
      .catch((error) => {
        console.error(settingsCopy.data.storageFolderPickRejected, error);
      });
  }

  function cancelRunning(): void {
    setPhase((current) => requestCancel(current));
    cancelWorkspaceMaintenance().catch(() => {
      noop();
    });
  }

  function runClearAllData(): void {
    if (clearRequestedRef.current) {
      return;
    }
    clearRequestedRef.current = true;
    setClearError(null);
    clearSkriuwLocalState();
    clearAllData().catch((error) => {
      clearRequestedRef.current = false;
      if (mountedRef.current) {
        setClearError(String(error));
      }
    });
  }

  const confirmation = phase.phase === "confirming" ? phase.confirmation : null;
  const copy = confirmation ? confirmationCopy(confirmation) : null;
  const running = phase.phase === "running" ? phase.kind : null;
  const exporting = running === "export";
  const backingUp = running === "backup";

  return (
    <section aria-label={settingsCopy.data.dataAndRecovery} className={settingsSection}>
      <SettingsGroup
        id="storage"
        title="Storage"
        keywords="database sqlite local file manager workspace path move location install"
      >
        {browser && (
          <SettingsRow
            label="Workspace database"
            detail={settingsCopy.data.storedDurablyInThisBrowsersPrivate}
          />
        )}
        {browser && installable && (
          <SettingsRow label="Install Skriuw" detail={settingsCopy.data.addsSkriuwToYourHomeScreen}>
            <button
              type="button"
              className={settingsButton}
              onClick={() => {
                void promptInstall();
              }}
            >
              <DownloadIcon size={15} />
              Install
            </button>
          </SettingsRow>
        )}
        {!browser && (
          <SettingsRow
            label="Workspace database"
            detail={<span className={settingsRowDetail}>{storagePath ?? "Locating…"}</span>}
          >
            <button
              type="button"
              className={settingsButton}
              onClick={() => {
                revealWorkspaceStorage().catch((error) => {
                  console.error(settingsCopy.data.revealStorageRejected, error);
                });
              }}
            >
              <FolderOpenIcon size={15} />
              {settingsCopy.data.showInFileManager}
            </button>
          </SettingsRow>
        )}
        {!browser && (
          <SettingsRow
            label="Move workspace"
            detail={settingsCopy.data.copiesTheDatabaseImagesHistoryAnd}
          >
            <InlineConfirm
              className="shrink-0"
              confirmLabel={
                confirmation?.kind === "relocate" && copy
                  ? copy.confirmLabel
                  : settingsCopy.data.moveAndRestart
              }
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
          </SettingsRow>
        )}
        <MaintenanceStatus
          phase={phase}
          kinds={["relocate"]}
          onCancel={cancelRunning}
          onForceBackup={() => runBackup(true)}
        />
      </SettingsGroup>
      <SettingsGroup
        id="transfer"
        title={settingsCopy.data.importExport}
        keywords="import export archive markdown obsidian notion evernote provider"
      >
        {!browser && (
          <>
            <SettingsRow
              label={settingsCopy.data.importNotesFromAFolder}
              detail={settingsCopy.data.markdownTextObsidianVaultsExtractedNotion}
            >
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
            </SettingsRow>
            <SettingsRow
              label={settingsCopy.data.importAProviderExport}
              detail={settingsCopy.data.zipEvernoteEnexJoplinGoogleKeep}
            >
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
            </SettingsRow>
            <SettingsRow
              label={settingsCopy.data.remoteImagesInImports}
              detail={settingsCopy.data.imagesThatMarkdownLinksFromThe}
              changed={changed("remoteImportImages")}
              className={settingsInputRow}
            >
              <Select
                label={settingsCopy.data.remoteImagesInImports}
                align="end"
                value={settings.remoteImportImages}
                options={REMOTE_IMPORT_IMAGE_OPTIONS}
                onChange={(value) => change("remoteImportImages", value)}
              />
            </SettingsRow>
          </>
        )}
        <SettingsRow
          label="Export workspace"
          detail={
            browser
              ? settingsCopy.data.downloadsAPortableJsonArchiveOf
              : settingsCopy.data.writesAPortableJsonArchiveInto
          }
        >
          <button
            type="button"
            className={settingsButton}
            disabled={busy}
            aria-busy={exporting}
            onClick={runExport}
          >
            {exporting ? "Exporting…" : "Export archive"}
          </button>
        </SettingsRow>
        <MaintenanceStatus
          phase={phase}
          kinds={["export"]}
          onCancel={cancelRunning}
          onForceBackup={() => runBackup(true)}
        />
      </SettingsGroup>
      <SettingsGroup id="clean-up" title="Clean up" keywords="empty notes trash">
        <EmptyNotesRow store={store} />
      </SettingsGroup>
      <SettingsGroup
        id="backups"
        title={settingsCopy.data.backupsRecovery}
        keywords="backup restore recovery rollback safety snapshot"
      >
        {browser && (
          <p className={settingsRowDetail} role="note">
            {settingsCopy.data.verifiedScheduledBackupsRunInThe}
          </p>
        )}
        {!browser && (
          <SettingsRow
            label="Scheduled backups"
            detail={settingsCopy.data.theDesktopAppTakesAVerified}
          >
            <button
              type="button"
              className={settingsButton}
              disabled={busy}
              aria-busy={backingUp}
              onClick={() => runBackup(false)}
            >
              {backingUp ? "Backing up…" : settingsCopy.data.backUpNow}
            </button>
          </SettingsRow>
        )}
        <MaintenanceStatus
          phase={phase}
          kinds={["backup", "restore"]}
          onCancel={cancelRunning}
          onForceBackup={() => runBackup(true)}
        />
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
            restoreConfirmLabel={
              confirmation?.kind === "restore" && copy ? copy.confirmLabel : "Restore backup"
            }
            restoreMessage={confirmation?.kind === "restore" && copy ? copy.body : null}
            onCancelRestore={() => setPhase((current) => dismissConfirmation(current))}
            onConfirmRestore={runConfirmed}
          />
        )}
      </SettingsGroup>
      <SettingsGroup
        id="danger"
        title="Danger zone"
        tone="danger"
        keywords="replace archive clear delete erase all data reset"
      >
        <SettingsRow
          label={settingsCopy.data.replaceWorkspaceFromArchive}
          detail={
            <>
              {settingsCopy.data.replacesEveryNoteInThisWorkspace}
              {browser ? settingsCopy.data.aSafetyCopyOfTheCurrent : ""}
            </>
          }
          notes={importPath !== "" ? <span className={settingsRowDetail}>{importPath}</span> : null}
          className={settingsInputRow}
        >
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
              confirmLabel={
                confirmation?.kind === "import" && copy ? copy.confirmLabel : "Replace workspace"
              }
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
        </SettingsRow>
        <MaintenanceStatus
          phase={phase}
          kinds={["import"]}
          onCancel={cancelRunning}
          onForceBackup={() => runBackup(true)}
        />
        <SettingsRow
          label={settingsCopy.data.clearAllData}
          detail={
            <>
              {settingsCopy.data.permanentlyDeletesNotesSettingsAnd}{" "}
              {browser
                ? settingsCopy.data.browserownedSqliteAndMediaStorage
                : settingsCopy.data.sqliteDataMarkdownHistoryMediaBackups}{" "}
              {settingsCopy.data.fromThisDeviceThen}
              {browser ? " reloads with" : " restarts into"}
              {settingsCopy.data.aFreshWorkspaceYouWillAlso}
            </>
          }
          notes={
            clearError ? (
              <span className="text-[11px] text-destructive" role="alert">
                {settingsCopy.data.couldNotClearAllData}
                {clearError}
              </span>
            ) : null
          }
          className={settingsInputRow}
        >
          <InlineConfirm
            className="shrink-0"
            confirmLabel="Delete everything"
            message={settingsCopy.data.thisCannotBeUndoneExportAnything}
            messagePlacement="stacked"
            onConfirm={runClearAllData}
            renderIdle={(arm) => (
              <button
                type="button"
                className={cn(settingsButton, settingsButtonDanger)}
                disabled={busy}
                onClick={arm}
              >
                {settingsCopy.data.clearAllData2}
              </button>
            )}
          />
        </SettingsRow>
      </SettingsGroup>
    </section>
  );
}

const backupListClass = "mt-1 mb-2.5 list-none rounded-lg border border-theme-divider p-0";
const backupItemClass =
  "flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] [&+&]:border-t [&+&]:border-theme-divider";
const backupToggleClass =
  "w-full cursor-pointer border-0 border-t border-theme-divider bg-transparent px-2.5 py-1.5 text-center text-[12px] text-theme-secondary transition-colors hover:text-foreground";

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
        <span className={settingsRowLabel}>{settingsCopy.data.backupsCouldNotBeListed}</span>
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
        {settingsCopy.data.noBackupsYetUseBackUp}
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
          <p className={settingsSubheading}>{settingsCopy.data.keptAfterRestores}</p>
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
  "my-2 flex items-center justify-between gap-3 rounded-lg border border-theme-divider bg-theme-deep px-3 py-2.5 text-xs text-theme-secondary";

type MaintenanceStatusProps = {
  phase: MaintenancePhase;
  kinds: readonly MaintenanceKind[];
  onCancel: () => void;
  onForceBackup: () => void;
};

function MaintenanceStatus({ phase, kinds, onCancel, onForceBackup }: MaintenanceStatusProps) {
  const kind = maintenanceKind(phase);
  if (kind === null || !kinds.includes(kind)) {
    return null;
  }
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
        {RUNNING_LABELS[phase.kind].replace("…", "")}
        {settingsCopy.data.wasCancelledNothingChanged}
      </p>
    );
  }
  if (phase.phase === "notDue") {
    return (
      <div className={maintenanceStatusClass} role="status">
        <span>
          {settingsCopy.data.backupNotDueYetNextScheduled}{" "}
          {maintenanceTimeFormatter.format(new Date(phase.nextDueAt))}.
        </span>
        <button type="button" className={settingsButton} onClick={onForceBackup}>
          {settingsCopy.data.backUpAnyway}
        </button>
      </div>
    );
  }
  if (phase.phase === "error") {
    return (
      <p
        className={cn(maintenanceStatusClass, "border-destructive/50 text-destructive")}
        role="alert"
      >
        {phase.message}
      </p>
    );
  }
  return null;
}
