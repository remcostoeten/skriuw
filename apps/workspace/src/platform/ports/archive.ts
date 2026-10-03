import type { WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";

export type ArchiveExportReport = {
  nodes: number;
  documents: number;
  images: number;
  exportedAt: number;
  fileName: string;
};

export type ArchiveImportReport = {
  nodes: number;
  documents: number;
  images: number;
  safetyBackupFileName: string;
  snapshot: WorkspaceSnapshot;
};
