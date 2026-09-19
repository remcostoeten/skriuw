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
import {
  activeDatabaseName,
  activeWorkspaceSlot,
  adoptWorkspaceSlot,
  isBlobsDirectory,
} from "./workspace-slot";

type BrowserWorkerValue = {
  kind: string;
  value?: unknown;
};

type BrowserCommand = {
  kind: string;
  payload?: unknown;
  expected: string;
};

/** Content key (32) + recovery code (20) + KDF salt (16); mirrors `NOTE_LOCK_CONFIGURE_ENTROPY_BYTES`. */
const NOTE_LOCK_ENTROPY_BYTES = 68;

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
  browserStorage = client.initialize(activeDatabaseName()).then(() => client).catch((error) => {
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
  if (command === "adopt_workspace_slot") {
    const { workspaceId } = args as { workspaceId: string };
    const linked = (await requestExpecting(
      "sync_connection",
      undefined,
      "sync_connection",
    )) as { workspaceId?: unknown } | null;
    const adoption = adoptWorkspaceSlot(
      workspaceId,
      typeof linked?.workspaceId === "string" ? linked.workspaceId : null,
    );
    if (adoption === "switched") await reopenForActiveSlot();
    return adoption as T;
  }
  if (command === "active_workspace_slot") {
    return activeWorkspaceSlot() as T;
  }
  if (command === "workspace_sync_status") {
    return browserSyncDriver(syncWorkerPort).status() as Promise<T>;
  }
  if (command === "connect_workspace_sync") {
    const { token, baseUrl } = args as { token: string; baseUrl?: string };
    return browserSyncDriver(syncWorkerPort).connect(token, baseUrl) as Promise<T>;
  }
  if (command === "disconnect_workspace_sync") {
    return browserSyncDriver(syncWorkerPort).pause() as Promise<T>;
  }
  if (command === "retry_workspace_sync") {
    return browserSyncDriver(syncWorkerPort).retry() as Promise<T>;
  }
  if (command === "refresh_workspace_sync") {
    return browserSyncDriver(syncWorkerPort).refresh() as Promise<T>;
  }
  if (command === "set_workspace_sync_online") {
    const { online } = args as { online: boolean };
    browserSyncDriver(syncWorkerPort).setOnline(online);
    return undefined as T;
  }
  if (command === "set_workspace_sync_visibility") {
    const { visible, focused } = args as { visible: boolean; focused: boolean };
    browserSyncDriver(syncWorkerPort).setVisibility(visible, focused);
    return undefined as T;
  }
  if (command === "workspace_encryption_state") {
    return requestExpecting("sync_encryption_state", null, "sync_encryption_state") as Promise<T>;
  }
  if (command === "enable_workspace_encryption") {
    const entropy = crypto.getRandomValues(new Uint8Array(20));
    return requestExpecting(
      "enable_sync_encryption",
      { entropy: Array.from(entropy) },
      "sync_recovery_code",
    ) as Promise<T>;
  }
  if (command === "unlock_workspace_encryption") {
    const { recoveryCode } = args as { recoveryCode: string };
    return requestExpecting(
      "unlock_sync_encryption",
      { recoveryCode },
      "sync_encryption_state",
    ) as Promise<T>;
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
  if (command === "reveal_media_blob") {
    throw new Error("Showing a file in the file manager needs the desktop app.");
  }
  if (command === "sweep_unused_media_blobs") {
    const { liveContentHashes } = args as { liveContentHashes?: readonly string[] };
    return sweepBrowserMediaBlobs(liveContentHashes ?? []) as Promise<T>;
  }

  const mapped = browserCommand(command, args);
  if (command === "apply_workspace_operations") {
    browserSyncDriver(syncWorkerPort).interruptForCommit();
  }
  const value = await requestExpecting(mapped.kind, mapped.payload, mapped.expected);
  if (command === "apply_workspace_operations") {
    browserSyncDriver(syncWorkerPort).notifyLocalCommit();
  }
  return value as T;
}

/**
 * Reopens the tab on the workspace the registry now points at. The worker
 * holds exclusive OPFS handles on the previous database and every module that
 * read from it is already mounted, so a reload is the only honest way to swap
 * accounts; the rest of sign-in does not continue past this call.
 */
async function reopenForActiveSlot(): Promise<void> {
  browserSyncDriver(syncWorkerPort).stop();
  const pending = browserStorage;
  browserStorage = null;
  if (pending) {
    await pending.then((client) => client.close()).catch(noop);
  }
  globalThis.location.reload();
}

/**
 * Deletes the durable browser workspace and reloads. Exported so the startup
 * failure screen can offer it too: a database that cannot open leaves the
 * settings surface unreachable, and without it the terminal states dead-end.
 */
export async function clearBrowserData(): Promise<void> {
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
    // Every account that has signed in on this profile left its own blob
    // directory behind; clearing one of them is not clearing the data.
    const names = [".skriuw-v2"];
    for await (const name of root.keys()) {
      if (isBlobsDirectory(name)) names.push(name);
    }
    for (const name of names) {
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
    case "search_index_status":
      return { kind: "search_index_status", expected: "search_index" };
    case "rebuild_search_index":
      return { kind: "rebuild_search_index", expected: "search_index" };
    case "read_workspace_delta":
      return { kind: "read_workspace_delta", payload: args, expected: "workspace_delta" };
    case "note_lock_state":
      return { kind: "note_lock_state", payload: { nowMs: Date.now() }, expected: "note_lock_state" };
    case "configure_note_lock":
      return {
        kind: "configure_note_lock",
        payload: {
          ...(args as object),
          entropy: Array.from(crypto.getRandomValues(new Uint8Array(NOTE_LOCK_ENTROPY_BYTES))),
          nowMs: Date.now(),
        },
        expected: "note_lock_recovery_code",
      };
    case "unlock_note_lock":
      return {
        kind: "unlock_note_lock",
        payload: { ...(args as object), nowMs: Date.now() },
        expected: "note_lock_state",
      };
    case "recover_note_lock":
      return {
        kind: "recover_note_lock",
        payload: { ...(args as object), nowMs: Date.now() },
        expected: "note_lock_state",
      };
    case "change_note_lock_secret":
      return {
        kind: "change_note_lock_secret",
        payload: { ...(args as object), nowMs: Date.now() },
        expected: "note_lock_state",
      };
    case "relock_note_lock":
      return { kind: "relock_note_lock", expected: "note_lock_state" };
    case "read_locked_documents":
      return { kind: "read_locked_documents", payload: args, expected: "locked_documents" };
    case "remove_note_lock":
      return { kind: "remove_note_lock", payload: { nowMs: Date.now() }, expected: "operation" };
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
