import {
  deleteBrowserMediaBlob,
  listBrowserMediaBlobs,
  storeBrowserMediaBlob,
  sweepBrowserMediaBlobs,
} from "./media";
import { pickTextFile } from "./files";
import { exportBrowserArchive, importBrowserArchive } from "./archive";
import {
  browserFailure,
  browserSync,
  clearBrowserData,
  closeBrowserStorage,
  closeBrowserWorkspace,
  linkedWorkspace,
  readMediaBlobWithReplicaFallback,
  reopenForActiveSlot,
  replicateMediaBlob,
  requestExpecting,
} from "./storage";
import { activeWorkspaceSlot, adoptWorkspaceSlot, releaseWorkspaceSlot } from "./workspace-slot";

type BrowserCommand = {
  kind: string;
  payload?: unknown;
  expected: string;
};

/** Content key (32) + recovery code (20) + KDF salt (16); mirrors `NOTE_LOCK_CONFIGURE_ENTROPY_BYTES`. */
const NOTE_LOCK_ENTROPY_BYTES = 68;

/**
 * Serves a desktop command name from the browser storage worker, OPFS, and
 * the browser sync driver, so callers stay runtime-neutral.
 */
export async function invokeBrowser<T>(command: string, args: unknown): Promise<T> {
  if (command === "browser_storage_capabilities") {
    return {
      opfs: typeof navigator.storage?.getDirectory === "function",
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
    } as T;
  }
  if (command === "close_workspace_window") {
    await closeBrowserStorage();
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
    const adoption = adoptWorkspaceSlot(workspaceId, await linkedWorkspace());
    if (adoption === "switched") await reopenForActiveSlot();
    return adoption as T;
  }
  if (command === "leave_account_workspace") {
    releaseWorkspaceSlot(await linkedWorkspace());
    await closeBrowserWorkspace();
    globalThis.location.assign("/");
    return undefined as T;
  }
  if (command === "active_workspace_slot") {
    return activeWorkspaceSlot() as T;
  }
  if (command === "workspace_sync_status") {
    return browserSync().status() as Promise<T>;
  }
  if (command === "connect_workspace_sync") {
    const { token, baseUrl } = args as { token: string; baseUrl?: string };
    return browserSync().connect(token, baseUrl) as Promise<T>;
  }
  if (command === "disconnect_workspace_sync") {
    return browserSync().pause() as Promise<T>;
  }
  if (command === "retry_workspace_sync") {
    return browserSync().retry() as Promise<T>;
  }
  if (command === "refresh_workspace_sync") {
    return browserSync().refresh() as Promise<T>;
  }
  if (command === "set_workspace_sync_online") {
    const { online } = args as { online: boolean };
    browserSync().setOnline(online);
    return undefined as T;
  }
  if (command === "set_workspace_sync_visibility") {
    const { visible, focused } = args as { visible: boolean; focused: boolean };
    browserSync().setVisibility(visible, focused);
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
    const bytes = args as Uint8Array;
    const stored = await storeBrowserMediaBlob(bytes);
    void replicateMediaBlob(stored.contentHash, stored.mimeType, bytes);
    return stored as T;
  }
  if (command === "download_remote_media") {
    throw new Error("Downloading an image from a web address needs the desktop app.");
  }
  if (command === "read_note_image_blob") {
    const { contentHash, mimeType } = args as { contentHash: string; mimeType: string };
    return readMediaBlobWithReplicaFallback(contentHash, mimeType) as Promise<T>;
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
    browserSync().interruptForCommit();
  }
  const value = await requestExpecting(mapped.kind, mapped.payload, mapped.expected);
  if (command === "apply_workspace_operations") {
    browserSync().notifyLocalCommit();
  }
  return value as T;
}

function pickAccept(args: unknown): string {
  const request = args as { extensions?: readonly string[] } | null;
  const extensions = request?.extensions ?? [];
  if (extensions.length === 0) {
    return ".json,application/json";
  }
  return extensions.map((extension) => `.${extension}`).join(",");
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
      return {
        kind: "note_lock_state",
        payload: { nowMs: Date.now() },
        expected: "note_lock_state",
      };
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
