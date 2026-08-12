import assert from "node:assert/strict";
import test from "node:test";
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
} from "../../../src/features/settings/maintenance-model";
import type {
  MaintenancePhase,
} from "../../../src/features/settings/maintenance-model";
import type { RecoveryInventory, WorkspaceSnapshot } from "../../../src/bridge/commands";

function running(
  kind: "export" | "import" | "backup" | "restore" | "relocate",
): MaintenancePhase {
  const state = beginOperation(IDLE_MAINTENANCE, kind);
  assert.ok(state);
  return state;
}

test("idle state accepts a new operation and marks it running", () => {
  const state = running("export");
  assert.deepEqual(state, { phase: "running", kind: "export", cancelRequested: false });
  assert.ok(isMaintenanceBusy(state));
});

test("running and confirming states reject duplicate submission", () => {
  const busy = running("backup");
  assert.equal(beginOperation(busy, "export"), null);
  assert.equal(
    requestConfirmation(busy, { kind: "import", archivePath: "/tmp/a.json" }),
    null,
  );

  const confirming = requestConfirmation(IDLE_MAINTENANCE, {
    kind: "import",
    archivePath: "/tmp/a.json",
  });
  assert.ok(confirming);
  assert.equal(beginOperation(confirming, "import"), null);
  assert.equal(
    requestConfirmation(confirming, { kind: "import", archivePath: "/tmp/b.json" }),
    null,
  );
});

test("confirmation runs the confirmed kind or dismisses back to idle", () => {
  const confirming = requestConfirmation(IDLE_MAINTENANCE, {
    kind: "restore",
    artifactFileName: "skriuw-backup-9.sqlite",
    createdAt: 9,
  });
  assert.ok(confirming);
  assert.deepEqual(confirmOperation(confirming), {
    phase: "running",
    kind: "restore",
    cancelRequested: false,
  });
  assert.deepEqual(dismissConfirmation(confirming), IDLE_MAINTENANCE);
  assert.equal(confirmOperation(IDLE_MAINTENANCE), null);
});

test("completion records success only from a running state", () => {
  const done = completeOperation(running("export"), "Exported 3 item(s).");
  assert.deepEqual(done, { phase: "success", kind: "export", detail: "Exported 3 item(s)." });
  assert.deepEqual(completeOperation(IDLE_MAINTENANCE, "noise"), IDLE_MAINTENANCE);
});

test("failure after a cancel request becomes the cancelled state", () => {
  const cancelled = failOperation(
    requestCancel(running("import")),
    "maintenance operation was cancelled",
  );
  assert.deepEqual(cancelled, { phase: "cancelled", kind: "import" });
});

test("failure without a cancel request keeps the diagnostic message", () => {
  const failed = failOperation(running("restore"), "backup artifact is not listed");
  assert.deepEqual(failed, {
    phase: "error",
    kind: "restore",
    message: "backup artifact is not listed",
  });
});

test("cancel requests outside a running state change nothing", () => {
  assert.deepEqual(requestCancel(IDLE_MAINTENANCE), IDLE_MAINTENANCE);
});

test("a not-due backup surfaces the next due time", () => {
  assert.deepEqual(backupNotDue(running("backup"), 1234), {
    phase: "notDue",
    nextDueAt: 1234,
  });
});

test("backup reports split into created and not-due outcomes", () => {
  assert.deepEqual(
    describeBackupReport({
      status: "created",
      artifactFileName: "skriuw-backup-5.sqlite",
      pruned: 2,
      nextDueAt: null,
    }),
    {
      created: true,
      detail: "Backup skriuw-backup-5.sqlite was written and verified. 2 old backup(s) were pruned.",
    },
  );
  assert.deepEqual(
    describeBackupReport({
      status: "skipped",
      artifactFileName: null,
      pruned: 0,
      nextDueAt: 777,
    }),
    { created: false, nextDueAt: 777 },
  );
});

test("swap reports distinguish restored from verification rollback", () => {
  const snapshot = {} as WorkspaceSnapshot;
  const restored = describeSwapReport({
    status: "replaced",
    snapshot,
    rollbackFileName: "workspace.db.rollback-9",
    failure: null,
  });
  assert.ok(restored.restored);
  assert.match(restored.detail, /workspace\.db\.rollback-9/);

  const rolledBack = describeSwapReport({
    status: "rolledBack",
    snapshot,
    rollbackFileName: null,
    failure: "restored database failed verification",
  });
  assert.equal(rolledBack.restored, false);
  assert.match(rolledBack.detail, /previous workspace was kept/);
  assert.match(rolledBack.detail, /failed verification/);
});

test("confirmation copy states the destructive scope", () => {
  const importCopy = confirmationCopy({ kind: "import", archivePath: "/tmp/a.json" });
  assert.match(importCopy.body, /replaces every note, folder, and setting/);
  assert.match(importCopy.body, /safety backup/);

  const restoreCopy = confirmationCopy({
    kind: "restore",
    artifactFileName: "skriuw-backup-3.sqlite",
    createdAt: 3,
  });
  assert.match(restoreCopy.body, /skriuw-backup-3\.sqlite/);
  assert.match(restoreCopy.body, /rollback/);

  const relocateCopy = confirmationCopy({ kind: "relocate", targetDir: "/mnt/vault" });
  assert.match(relocateCopy.body, /\/mnt\/vault/);
  assert.match(relocateCopy.body, /restarts/);
  assert.match(relocateCopy.body, /kept untouched/);
  assert.equal(relocateCopy.confirmLabel, "Move and restart");
});

test("recovery inventory projects newest-first backups and flags emptiness", () => {
  const empty = projectRecoveryInventory({ manifest: null, rollbacks: [] });
  assert.deepEqual(empty, { backups: [], rollbacks: [], empty: true });

  const inventory: RecoveryInventory = {
    manifest: {
      manifestVersion: 1,
      generatedAt: 30,
      policy: { cadenceMs: 1, maxArtifacts: 28, maxAgeMs: 1 },
      artifacts: [
        {
          filename: "old.sqlite",
          createdAt: 10,
          sizeBytes: 2048,
          sha256: "a",
          schemaVersion: 1,
          migrationFingerprint: "f",
          verified: true,
        },
        {
          filename: "new.sqlite",
          createdAt: 20,
          sizeBytes: 4096,
          sha256: "b",
          schemaVersion: 1,
          migrationFingerprint: "f",
          verified: false,
        },
      ],
      pendingDeletions: [],
    },
    rollbacks: [{ fileName: "workspace.db.rollback-5", createdAt: 5, sizeBytes: 512 }],
  };
  const projected = projectRecoveryInventory(inventory);
  assert.equal(projected.empty, false);
  assert.deepEqual(
    projected.backups.map((entry) => entry.fileName),
    ["new.sqlite", "old.sqlite"],
  );
  assert.equal(projected.backups[0].verified, false);
  assert.equal(projected.rollbacks[0].fileName, "workspace.db.rollback-5");
});

test("archive report copy stays true for both desktop and browser runtimes", () => {
  const exported = describeExportReport({
    nodes: 4,
    documents: 3,
    images: 0,
    exportedAt: 1,
    fileName: "skriuw-workspace-2026.json",
  });
  assert.equal(
    exported,
    "Exported 4 item(s), 3 document(s), and 0 image(s) to skriuw-workspace-2026.json.",
  );
  const imported = describeImportReport({
    nodes: 4,
    documents: 3,
    images: 0,
    safetyBackupFileName: "skriuw-safety-backup-2026.json",
    snapshot: {} as WorkspaceSnapshot,
  });
  assert.equal(
    imported,
    "Imported 4 item(s), 3 document(s), and 0 image(s). The previous workspace was kept as skriuw-safety-backup-2026.json.",
  );
});

test("byte sizes format into readable units", () => {
  assert.equal(formatSizeBytes(512), "512 B");
  assert.equal(formatSizeBytes(2048), "2.0 KB");
  assert.equal(formatSizeBytes(5 * 1024 * 1024), "5.0 MB");
});
