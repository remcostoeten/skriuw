import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  BrowserStorageWorkerClient,
  type BrowserStorageFailure,
} from "../../../crates/skriuw-sqlite-wasm/web/worker-client.ts";
import type { WorkspaceArchive, WorkspaceSnapshot } from "../contracts/workspace";
import type { ArchiveExportReport, ArchiveImportReport } from "./commands";
import { pickTextFile, readPickedFile, saveTextFile } from "./browser-files";

type BrowserWorkerValue = {
  kind: string;
  value?: unknown;
};

type BrowserCommand = {
  kind: string;
  payload?: unknown;
  expected: string;
};

let browserStorage: Promise<BrowserStorageWorkerClient> | null = null;

/** True when the renderer is running in a browser rather than the Tauri shell. */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

function getBrowserStorage(): Promise<BrowserStorageWorkerClient> {
  if (browserStorage) return browserStorage;
  const worker = new Worker(new URL("./browser-worker.ts", import.meta.url), {
    type: "module",
    name: "skriuw-storage",
  });
  const client = new BrowserStorageWorkerClient(worker);
  browserStorage = client.initialize().then(() => client).catch((error) => {
    client.terminate();
    browserStorage = null;
    throw error;
  });
  return browserStorage;
}

async function invokeBrowser<T>(command: string, args: unknown): Promise<T> {
  if (command === "browser_storage_capabilities") {
    return {
      opfs: typeof navigator.storage?.getDirectory === "function",
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
    } as T;
  }
  if (command === "close_workspace_window") {
    const client = await getBrowserStorage();
    await client.close();
    browserStorage = null;
    return undefined as T;
  }
  if (command === "pick_import_file") {
    return pickTextFile(pickAccept(args)) as Promise<T>;
  }
  if (command === "export_workspace_archive") {
    return exportBrowserArchive() as Promise<T>;
  }
  if (command === "import_workspace_archive") {
    return importBrowserArchive(args) as Promise<T>;
  }

  const mapped = browserCommand(command, args);
  return requestExpecting(mapped.kind, mapped.payload, mapped.expected) as Promise<T>;
}

async function requestExpecting(
  kind: string,
  payload: unknown,
  expected: string,
): Promise<unknown> {
  const client = await getBrowserStorage();
  const response = await client.request<BrowserWorkerValue>(kind, payload);
  if (response.kind !== expected) {
    client.terminate();
    browserStorage = null;
    throw browserFailure(
      "worker_crashed",
      `Browser storage returned ${response.kind}; expected ${expected}.`,
      true,
    );
  }
  return response.value;
}

function pickAccept(args: unknown): string {
  const request = args as { extensions?: readonly string[] } | null;
  const extensions = request?.extensions ?? [];
  if (extensions.length === 0) {
    return ".json,application/json";
  }
  return extensions.map((extension) => `.${extension}`).join(",");
}

function archiveFileName(prefix: string, timestamp: number): string {
  const stamp = new Date(timestamp).toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.json`;
}

async function exportBrowserArchive(): Promise<ArchiveExportReport> {
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

async function importBrowserArchive(args: unknown): Promise<ArchiveImportReport> {
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

function browserCommand(command: string, args: unknown): BrowserCommand {
  switch (command) {
    case "bootstrap_workspace":
      return { kind: "bootstrap", expected: "bootstrap" };
    case "load_sidebar_expansion":
      return { kind: "load_sidebar_expansion", expected: "sidebar_expansion" };
    case "save_sidebar_expansion":
      return { kind: "save_sidebar_expansion", payload: args, expected: "unit" };
    case "load_pane_layout":
      return { kind: "load_pane_layout", expected: "pane_layout" };
    case "save_pane_layout":
      return { kind: "save_pane_layout", payload: args, expected: "unit" };
    case "apply_workspace_operations":
      return { kind: "apply_operations", payload: args, expected: "operation" };
    case "search_workspace":
      return { kind: "search", payload: args, expected: "search" };
    default:
      throw browserFailure(
        "invalid_request",
        `The ${command} capability is not available in the browser runtime.`,
      );
  }
}

function browserFailure(
  code: BrowserStorageFailure["code"],
  message: string,
  terminal = false,
): BrowserStorageFailure {
  return {
    code,
    message,
    recovery: "Use the supported browser-local workspace actions or export a portable archive.",
    terminal,
  };
}

/**
 * Runtime-neutral command invocation. The browser path deliberately goes
 * through a worker so SQLite-WASM/OPFS can be added without changing callers.
 */
export function invoke<T>(command: string, args?: unknown): Promise<T> {
  if (!isBrowserRuntime()) {
    return args === undefined
      ? tauriInvoke<T>(command)
      : tauriInvoke<T>(command, args as Record<string, unknown>);
  }
  return invokeBrowser<T>(command, args ?? null);
}
