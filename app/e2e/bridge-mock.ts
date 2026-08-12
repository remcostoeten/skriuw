import type { WorkspaceOperationEnvelope, WorkspaceSnapshot } from "../src/contracts/workspace";

type InvokeArguments = {
  operations?: WorkspaceOperationEnvelope[];
  query?: string;
  noteId?: string;
  versionId?: string;
  archivePath?: string;
  artifactFileName?: string;
  force?: boolean;
  sourcePath?: string;
  rootPath?: string;
  title?: string;
};

const calls: { command: string; arguments: InvokeArguments }[] = [];
const nextFailures = new Map<string, string>();
let snapshot: WorkspaceSnapshot | null = null;
let backupCreated = false;

export function configureBridge(nextSnapshot: WorkspaceSnapshot): void {
  snapshot = structuredClone(nextSnapshot);
  calls.length = 0;
  nextFailures.clear();
  backupCreated = false;
}

export function convertFileSrc(filePath: string, protocol = "asset"): string {
  return `${protocol}://localhost/${encodeURIComponent(filePath)}`;
}

export function failNextBridgeCall(command: string, message: string): void {
  nextFailures.set(command, message);
}

export function readBridgeCalls(): { command: string; arguments: InvokeArguments }[] {
  return structuredClone(calls);
}

function currentSnapshot(): WorkspaceSnapshot {
  if (!snapshot) {
    throw new Error("workflow bridge is not configured");
  }
  return structuredClone(snapshot);
}

export function invoke<T>(command: string, arguments_: InvokeArguments = {}): Promise<T> {
  calls.push({ command, arguments: structuredClone(arguments_) });
  const failure = nextFailures.get(command);
  if (failure) {
    nextFailures.delete(command);
    return Promise.reject(new Error(failure));
  }
  if (command === "apply_workspace_operations") {
    const operations = arguments_.operations ?? [];
    return Promise.resolve({
      applied: operations.length,
      revisions: [],
      rankChanges: [],
    } as T);
  }
  if (command === "pick_import_file") {
    return Promise.resolve("/tmp/skriuw-provider-export" as T);
  }
  if (command === "prepare_import_source") {
    return Promise.resolve({
      rootPath: "/tmp/skriuw-provider-export",
      temporary: false,
      tree: {
        directories: ["Imported"],
        files: [
          {
            relativePath: "Imported/Provider note.md",
            content:
              "---\nstatus: shipped\ntags: [migration]\n---\n# Provider note\n\nImported end to end.",
          },
        ],
        assets: [],
        unsupported: [],
        skipped: 0,
      },
    } as T);
  }
  if (command === "cleanup_import_source") {
    return Promise.resolve(undefined as T);
  }
  if (command === "bootstrap_workspace") {
    return Promise.resolve(currentSnapshot() as T);
  }
  if (command === "search_workspace") {
    return Promise.resolve([
      {
        noteId: "note-alpha",
        title: "Alpha note",
        snippet: `Content matching ${arguments_.query ?? ""}`,
        score: 1,
      },
    ] as T);
  }
  if (command === "read_history_version") {
    return Promise.resolve({
      noteId: arguments_.noteId ?? "note-alpha",
      versionId: arguments_.versionId ?? "version-alpha-1",
      createdAt: 1_752_999_990_000,
      summary: "Earlier alpha version",
      revision: 0,
      markdown: "restored alpha version",
    } as T);
  }
  if (command === "workspace_storage_path") {
    return Promise.resolve("/tmp/skriuw-e2e/workspace.db" as T);
  }
  if (command === "reveal_workspace_storage" || command === "cancel_workspace_maintenance") {
    return Promise.resolve((command === "cancel_workspace_maintenance") as T);
  }
  if (command === "export_workspace_archive") {
    return Promise.resolve({
      nodes: currentSnapshot().nodes.length,
      documents: currentSnapshot().documents.length,
      exportedAt: 1_753_000_000_000,
      fileName: "skriuw-e2e-export.json",
    } as T);
  }
  if (command === "import_workspace_archive") {
    return Promise.resolve({
      nodes: currentSnapshot().nodes.length,
      documents: currentSnapshot().documents.length,
      safetyBackupFileName: "pre-import-e2e.sqlite",
      snapshot: currentSnapshot(),
    } as T);
  }
  if (command === "create_workspace_backup") {
    backupCreated = true;
    return Promise.resolve({
      status: "created",
      artifactFileName: "skriuw-backup-e2e.sqlite",
      pruned: 0,
      nextDueAt: 1_753_021_600_000,
    } as T);
  }
  if (command === "list_workspace_recovery") {
    return Promise.resolve({
      manifest: backupCreated
        ? {
            manifestVersion: 1,
            generatedAt: 1_753_000_000_000,
            policy: {
              cadenceMs: 21_600_000,
              maxArtifacts: 28,
              maxAgeMs: 2_592_000_000,
            },
            artifacts: [
              {
                filename: "skriuw-backup-e2e.sqlite",
                createdAt: 1_753_000_000_000,
                sizeBytes: 4096,
                sha256: "e2e",
                schemaVersion: 2,
                migrationFingerprint: "e2e",
                verified: true,
              },
            ],
            pendingDeletions: [],
          }
        : null,
      rollbacks: backupCreated
        ? [
            {
              fileName: "rollback-e2e.sqlite",
              createdAt: 1_752_999_000_000,
              sizeBytes: 4096,
            },
          ]
        : [],
    } as T);
  }
  if (command === "restore_workspace_backup") {
    return Promise.resolve({
      status: "replaced",
      snapshot: currentSnapshot(),
      rollbackFileName: "rollback-e2e.sqlite",
      failure: null,
    } as T);
  }
  return Promise.reject(new Error(`unexpected workflow bridge call: ${command}`));
}
