import {
  BrowserStorageWorkerClient,
  type BrowserStorageFailure,
} from "../../../../../crates/skriuw-sqlite-wasm/web/worker-client.ts";
import { listBrowserMediaBlobs, readBrowserMediaBlob, storeBrowserMediaBlob } from "./media";
import { browserSyncDriver, type BrowserSyncDriver, type SyncWorkerPort } from "./sync";
import { publishBrowserSyncEvent } from "./sync-events";
import { noop } from "@skriuw/shared/helpers/noop";
import { clearSkriuwLocalState } from "./local-state";
import { activeDatabaseName, isBlobsDirectory } from "./workspace-slot";

type BrowserWorkerValue = {
  kind: string;
  value?: unknown;
};

let browserStorage: Promise<BrowserStorageWorkerClient> | null = null;
/** The worker behind `browserStorage`, reachable without awaiting it. */
let openStorageWorker: BrowserStorageWorkerClient | null = null;
let storageReleased = false;

/**
 * Hands the durable database to another browser tab. The worker is closed so
 * its exclusive OPFS handles are dropped, and the release latches: a stray
 * caller must not silently reopen the database this tab just gave away.
 */
export async function releaseBrowserStorage(): Promise<void> {
  if (storageReleased) return;
  storageReleased = true;
  browserSync().stop();
  const pending = browserStorage;
  browserStorage = null;
  if (!pending) {
    openStorageWorker = null;
    return;
  }
  const client = await pending.catch(() => null);
  if (client) {
    await client.close().catch(noop);
  }
  // Cleared only once the worker is really gone: a page frozen mid-close still
  // has one to terminate, and nothing else can reach it.
  openStorageWorker = null;
}

/**
 * Drops the durable database synchronously, for the moment the page is being
 * unloaded or frozen into the back/forward cache. A graceful close cannot be
 * awaited there: a frozen page runs no further tasks, so its worker would keep
 * the exclusive OPFS handles and block every other tab indefinitely. A close
 * already under way is no exception; its worker is alive until it answers.
 * Accepted writes are already durable; only debounced UI continuity is at
 * risk, which is best-effort by contract. The page must reload to write again.
 *
 * @returns True when a worker was still holding the database, so the caller
 * knows this page can no longer write and has to reload before it may again.
 */
export function abandonBrowserStorage(): boolean {
  const client = openStorageWorker;
  if (!client) return false;
  storageReleased = true;
  browserSync().stop();
  browserStorage = null;
  openStorageWorker = null;
  client.terminate();
  return true;
}

function getBrowserStorage(): Promise<BrowserStorageWorkerClient> {
  if (browserStorage) return browserStorage;
  if (storageReleased) {
    return Promise.reject(
      browserFailure("shutdown", "This tab handed the workspace to another Skriuw tab.", true),
    );
  }
  const worker = new Worker(new URL("./storage-worker.ts", import.meta.url), {
    type: "module",
    name: "skriuw-storage",
  });
  const client = new BrowserStorageWorkerClient(worker);
  openStorageWorker = client;
  client.setEventListener(publishBrowserSyncEvent);
  browserStorage = client
    .initialize(activeDatabaseName())
    .then(() => client)
    .catch((error) => {
      client.terminate();
      browserStorage = null;
      openStorageWorker = null;
      throw error;
    });
  void browserStorage.then(() => browserSync().resume()).catch(noop);
  void browserStorage.then(backfillMediaReplica).catch(noop);
  return browserStorage;
}

const syncWorkerPort: SyncWorkerPort = {
  request: (kind, payload, expected, timeoutMs) =>
    requestExpecting(kind, payload, expected, timeoutMs),
};

/** The browser sync driver, bound to this tab's storage worker. */
export function browserSync(): BrowserSyncDriver {
  return browserSyncDriver(syncWorkerPort);
}

/** Closes the storage worker for good, as the desktop shell closes its window. */
export async function closeBrowserStorage(): Promise<void> {
  const client = await getBrowserStorage();
  await client.close();
  browserStorage = null;
  openStorageWorker = null;
}

/**
 * Reopens the tab on the workspace the registry now points at. The worker
 * holds exclusive OPFS handles on the previous database and every module that
 * read from it is already mounted, so a reload is the only honest way to swap
 * accounts; the rest of sign-in does not continue past this call.
 */
export async function reopenForActiveSlot(): Promise<void> {
  await closeBrowserWorkspace();
  globalThis.location.reload();
}

export async function closeBrowserWorkspace(): Promise<void> {
  browserSync().stop();
  const pending = browserStorage;
  browserStorage = null;
  openStorageWorker = null;
  if (pending) {
    await pending.then((client) => client.close()).catch(noop);
  }
}

/** Cloud workspace the open storage has synced with, as the storage records it. */
export async function linkedWorkspace(): Promise<string | null> {
  const linked = (await requestExpecting("sync_connection", undefined, "sync_connection")) as {
    workspaceId?: unknown;
  } | null;
  return typeof linked?.workspaceId === "string" ? linked.workspaceId : null;
}

/**
 * Deletes the durable browser workspace and reloads. Exported so the startup
 * failure screen can offer it too: a database that cannot open leaves the
 * settings surface unreachable, and without it the terminal states dead-end.
 */
export async function clearBrowserData(): Promise<void> {
  browserSync().stop();
  if (browserStorage) {
    const client = await browserStorage;
    try {
      await client.close();
    } catch {
      // close() always terminates the worker; the entire OPFS pool is deleted next.
      noop();
    }
    browserStorage = null;
    openStorageWorker = null;
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

const ASSET_CHUNK_BYTES = 1024 * 1024;

/**
 * Copies a locally stored blob into the worker's sync asset store, which is
 * where pushes read media bytes from. Until it lands, the operation that
 * references the blob waits as blocked; the refresh requeues it.
 */
export async function replicateMediaBlob(
  contentHash: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<void> {
  try {
    for (let offset = 0; offset < bytes.byteLength || offset === 0; offset += ASSET_CHUNK_BYTES) {
      const result = (await requestExpecting(
        "write_asset_chunk",
        {
          contentHash,
          mimeType,
          offset,
          totalSize: bytes.byteLength,
          bytes: Array.from(bytes.subarray(offset, offset + ASSET_CHUNK_BYTES)),
        },
        "asset_write",
      )) as { complete: boolean };
      if (result.complete) break;
    }
    await browserSync().refresh();
  } catch (error) {
    console.error("media blob could not be queued for sync", error);
  }
}

async function backfillMediaReplica(): Promise<void> {
  for (const blob of await listBrowserMediaBlobs()) {
    const bytes = new Uint8Array(await readBrowserMediaBlob(blob.contentHash, blob.mimeType));
    await replicateMediaBlob(blob.contentHash, blob.mimeType, bytes);
  }
}

/**
 * Media pulled by sync lands in the worker's asset store; the first read
 * copies it into this device's media directory.
 */
export async function readMediaBlobWithReplicaFallback(
  contentHash: string,
  mimeType: string,
): Promise<ArrayBuffer> {
  try {
    return await readBrowserMediaBlob(contentHash, mimeType);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
  const bytes = await readReplicatedMediaBlob(contentHash, mimeType);
  await storeBrowserMediaBlob(bytes);
  return bytes.buffer as ArrayBuffer;
}

async function readReplicatedMediaBlob(contentHash: string, mimeType: string): Promise<Uint8Array> {
  let bytes: Uint8Array | null = null;
  let offset = 0;
  do {
    const chunk = (await requestExpecting(
      "read_asset_chunk",
      { contentHash, mimeType, offset, length: ASSET_CHUNK_BYTES },
      "asset_chunk",
    )) as { totalSize: number; bytes: number[] } | null;
    if (!chunk) {
      throw new DOMException("This media has not synced to this device yet.", "NotFoundError");
    }
    bytes ??= new Uint8Array(chunk.totalSize);
    bytes.set(chunk.bytes, offset);
    offset += chunk.bytes.length;
    if (chunk.bytes.length === 0) break;
  } while (offset < bytes.byteLength);
  return bytes ?? new Uint8Array();
}

export async function requestExpecting(
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
    openStorageWorker = null;
    throw browserFailure(
      "worker_crashed",
      `Browser storage returned ${response.kind}; expected ${expected}.`,
      true,
    );
  }
  return response.value;
}

export function browserFailure(
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
