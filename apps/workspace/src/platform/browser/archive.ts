import type {
  WorkspaceArchive,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import type { ArchiveExportReport, ArchiveImportReport } from "@/platform/ports/archive";
import { readPickedFile, saveTextFile } from "./files";
import { browserFailure, requestExpecting } from "./storage";

function archiveFileName(prefix: string, timestamp: number): string {
  const stamp = new Date(timestamp).toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.json`;
}

export async function exportBrowserArchive(): Promise<ArchiveExportReport> {
  const exportedAt = Date.now();
  const archive = (await requestExpecting(
    "export_archive",
    { exportedAt },
    "archive",
  )) as WorkspaceArchive;
  const fileName = archiveFileName("skriuw-workspace", exportedAt);
  saveTextFile(fileName, JSON.stringify(archive));
  return {
    nodes: archive.nodes.length,
    documents: archive.documents.length,
    images: 0,
    exportedAt,
    fileName,
  };
}

function parsePickedArchive(name: string, text: string): WorkspaceArchive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw browserFailure("invalid_request", `${name} is not a workspace archive.`);
  }
  const archive = parsed as Partial<WorkspaceArchive> | null;
  if (
    archive === null ||
    typeof archive !== "object" ||
    typeof archive.archiveVersion !== "number" ||
    !Array.isArray(archive.nodes)
  ) {
    throw browserFailure("invalid_request", `${name} is not a workspace archive.`);
  }
  return archive as WorkspaceArchive;
}

export async function importBrowserArchive(args: unknown): Promise<ArchiveImportReport> {
  const { archivePath } = args as { archivePath: string };
  const picked = readPickedFile(archivePath);
  if (!picked) {
    throw browserFailure(
      "invalid_request",
      "Choose the archive file again before replacing the workspace.",
    );
  }
  const archive = parsePickedArchive(picked.name, picked.text);
  const safetyExportedAt = Date.now();
  const current = (await requestExpecting(
    "export_archive",
    { exportedAt: safetyExportedAt },
    "archive",
  )) as WorkspaceArchive;
  const safetyBackupFileName = archiveFileName("skriuw-safety-backup", safetyExportedAt);
  saveTextFile(safetyBackupFileName, JSON.stringify(current));
  const summary = (await requestExpecting(
    "replace_from_archive",
    { archive },
    "import_summary",
  )) as { nodes: number; documents: number };
  const snapshot = (await requestExpecting(
    "bootstrap",
    undefined,
    "bootstrap",
  )) as WorkspaceSnapshot;
  return {
    nodes: summary.nodes,
    documents: summary.documents,
    images: 0,
    safetyBackupFileName,
    snapshot,
  };
}
