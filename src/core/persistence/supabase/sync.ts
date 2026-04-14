import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";
import { listLocalRecords } from "@/core/persistence/repositories/local-records";
import {
  getRemotePersistenceUserId,
  putRemoteRecord,
  softDeleteRemoteRecord,
  type RemoteStoreName,
} from "./records";

const LAST_SYNC_KEY = "skriuw:last-remote-sync";

// ── Full push sync (local → remote) ─────────────────────────────────

export async function pushAllToRemote(): Promise<void> {
  const userId = getRemotePersistenceUserId();
  if (!userId) {
    return;
  }

  const [notes, folders, journalEntries, tags] = await Promise.all([
    listLocalRecords(PERSISTED_STORE_NAMES.notes),
    listLocalRecords(PERSISTED_STORE_NAMES.folders),
    listLocalRecords(PERSISTED_STORE_NAMES.journalEntries),
    listLocalRecords(PERSISTED_STORE_NAMES.tags),
  ]);

  await Promise.all([
    ...notes.map((note) => putRemoteRecord(PERSISTED_STORE_NAMES.notes, note, userId)),
    ...folders.map((folder) => putRemoteRecord(PERSISTED_STORE_NAMES.folders, folder, userId)),
    ...journalEntries.map((entry) =>
      putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, entry, userId)
    ),
    ...tags.map((tag) => putRemoteRecord(PERSISTED_STORE_NAMES.tags, tag, userId)),
  ]);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${LAST_SYNC_KEY}:${userId}`, new Date().toISOString());
  }

  console.info(
    `[sync] pushed ${notes.length} notes, ${folders.length} folders, ${journalEntries.length} journal entries, ${tags.length} tags`,
  );
}

// ── Single-record push (called after each local write) ───────────────

export async function pushRecordToRemote(
  storeName: RemoteStoreName,
  record: Record<string, unknown>,
): Promise<void> {
  const userId = getRemotePersistenceUserId();
  if (!userId) {
    return;
  }

  try {
    await putRemoteRecord(storeName, record as never, userId);
  } catch {
    // Sync failures are non-blocking; data is safe locally
  }
}

export async function deleteRecordFromRemote(
  storeName: RemoteStoreName,
  recordId: string,
): Promise<void> {
  const userId = getRemotePersistenceUserId();
  if (!userId) {
    return;
  }

  try {
    await softDeleteRemoteRecord(storeName, recordId, userId);
  } catch {
    // Sync failures are non-blocking
  }
}

export function getLastSyncTime(): string | null {
  if (typeof window === "undefined") return null;
  const userId = getRemotePersistenceUserId() ?? "privacy";
  return window.localStorage.getItem(`${LAST_SYNC_KEY}:${userId}`);
}

export async function pullAllFromRemote(): Promise<void> {
  // Reserved for a future local merge/pull implementation.
}
