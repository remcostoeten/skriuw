import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  BrowserStorageWorkerClient,
  type BrowserStorageFailure,
} from "../../../crates/skriuw-sqlite-wasm/web/worker-client.ts";
import type { WorkspaceArchive, WorkspaceSnapshot } from "@/contracts/workspace";
import type { ArchiveExportReport, ArchiveImportReport } from "./commands";
import {
  deleteBrowserMediaBlob,
  listBrowserMediaBlobs,
  readBrowserMediaBlob,
  storeBrowserMediaBlob,
  sweepBrowserMediaBlobs,
} from "./browser-media";
import { pickTextFile, readPickedFile, saveTextFile } from "./browser-files";
import { browserSyncDriver, publishBrowserSyncEvent, type SyncWorkerPort } from "./browser-sync";
import { noop } from "@/shared/lib/noop";
import { clearSkriuwLocalState } from "./local-state";

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
let storageReleased = false;

/** True when the renderer is running in a browser rather than the Tauri shell. */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

/**
 * Refuses a capability that only the desktop shell implements. The surface that
 * offers it should already be hidden in the browser; this is the backstop that
 * keeps a stray caller from reaching a command the browser worker cannot serve.
 *
 * @param capability Named in the thrown message, so the refusal is actionable.
 */
export function requireDesktopRuntime(capability: string): void {
  if (isBrowserRuntime()) {
    throw new Error(`${capability} needs the desktop app.`);
  }
}

/**
 * Hands the durable database to another browser tab. The worker is closed so
 * its exclusive OPFS handles are dropped, and the release latches: a stray
 * caller must not silently reopen the database this tab just gave away.
 */
export async function releaseBrowserStorage(): Promise<void> {
  if (!isBrowserRuntime() || storageReleased) return;
  storageReleased = true;
  browserSyncDriver(syncWorkerPort).stop();
  const pending = browserStorage;
  browserStorage = null;
  if (!pending) return;
  const client = await pending.catch(() => null);
  if (client) {
    await client.close().catch(noop);
  }
}

function getBrowserStorage(): Promise<BrowserStorageWorkerClient> {
  if (browserStorage) return browserStorage;
  if (storageReleased) {
    return Promise.reject(
      browserFailure(
        "shutdown",
        "This tab handed the workspace to another Skriuw tab.",
        true,
      ),
    );
  }
  const worker = new Worker(new URL("./browser-worker.ts", import.meta.url), {
    type: "module",
    name: "skriuw-storage",
  });
  const client = new BrowserStorageWorkerClient(worker);
  client.setEventListener(publishBrowserSyncEvent);
  browserStorage = client.initialize().then(() => client).catch((error) => {
    client.terminate();
    browserStorage = null;
    throw error;
  });
  void browserStorage
    .then(() => browserSyncDriver(syncWorkerPort).resume())
    .catch(noop);
  return browserStorage;
}

const syncWorkerPort: SyncWorkerPort = {
  request: (kind, payload, expected, timeoutMs) =>
    requestExpecting(kind, payload, expected, timeoutMs),
};

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
  if (command === "clear_all_data") {
    await clearBrowserData();
    return undefined as T;
  }
  if (command === "workspace_sync_status") {
    return browserSyncDriver(syncWorkerPort).status() as Promise<T>;
  }
  if (command === "connect_workspace_sync") {
    const { token } = args as { token: string };
    return browserSyncDriver(syncWorkerPort).connect(token) as Promise<T>;
  }
  if (command === "disconnect_workspace_sync") {
    return browserSyncDriver(syncWorkerPort).pause() as Promise<T>;
  }
  if (command === "retry_workspace_sync") {
    return browserSyncDriver(syncWorkerPort).retry() as Promise<T>;
  }
  if (command === "store_note_image") {
    return storeBrowserMediaBlob(args as Uint8Array) as Promise<T>;
  }
  if (command === "download_remote_media") {
    throw new Error("Downloading an image from a web address needs the desktop app.");
  }
  if (command === "read_note_image_blob") {
    const { contentHash, mimeType } = args as { contentHash: string; mimeType: string };
    return readBrowserMediaBlob(contentHash, mimeType) as Promise<T>;
  }
  if (command === "list_media_blobs") {
    return listBrowserMediaBlobs() as Promise<T>;
  }
  if (command === "delete_media_blob") {
    const { contentHash, mimeType } = args as { contentHash: string; mimeType: string };
    return deleteBrowserMediaBlob(contentHash, mimeType) as Promise<T>;
  }
  if (command === "sweep_unused_media_blobs") {
    const { liveContentHashes } = args as { liveContentHashes?: readonly string[] };
    return sweepBrowserMediaBlobs(liveContentHashes ?? []) as Promise<T>;
  }

  const mapped = browserCommand(command, args);
  const value = await requestExpecting(mapped.kind, mapped.payload, mapped.expected);
  if (command === "apply_workspace_operations") {
    browserSyncDriver(syncWorkerPort).notifyLocalCommit();
  }
  return value as T;
}

async function clearBrowserData(): Promise<void> {
  browserSyncDriver(syncWorkerPort).stop();
  if (browserStorage) {
    const client = await browserStorage;
    try {
      await client.close();
    } catch {
      // close() always terminates the worker; the entire OPFS pool is deleted next.
    }
    browserStorage = null;
  }
  if (typeof navigator.storage?.getDirectory === "function") {
    const root = await navigator.storage.getDirectory();
    for (const name of [".skriuw-v2", "skriuw-media-blobs"]) {
      try {
        await root.removeEntry(name, { recursive: true });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "NotFoundError")) {
          throw error;
        }
      }
    }
  }
  clearSkriuwLocalState();
  globalThis.location.reload();
}

async function requestExpecting(
  kind: string,
  payload: unknown,
  expected: string,
  timeoutMs?: number,
): Promise<unknown> {
  const client = await getBrowserStorage();
  const response = await client.request<BrowserWorkerValue>(kind, payload, timeoutMs);
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
