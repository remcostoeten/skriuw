import { getSupabaseClient } from "./client";
import type {
  PersistedFolder,
  PersistedJournalEntry,
  PersistedNote,
  PersistedPreferences,
  PersistedTag,
} from "@/core/shared/persistence-types";
import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";
import { listPGliteRecords } from "@/core/persistence/pglite/records";
import { getAuthStateSnapshot } from "@/modules/auth";

const LAST_SYNC_KEY = "haptic:last-remote-sync";

// ── Row mappers (camelCase local → snake_case Supabase) ──────────────

function noteToRow(note: PersistedNote) {
  return {
    id: note.id,
    name: note.name,
    content: note.content,
    rich_content: note.richContent,
    preferred_editor_mode: note.preferredEditorMode,
    parent_id: note.parentId,
    journal_meta: note.journalMeta ?? null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function folderToRow(folder: PersistedFolder) {
  return {
    id: folder.id,
    name: folder.name,
    parent_id: folder.parentId,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
  };
}

function journalEntryToRow(entry: PersistedJournalEntry) {
  return {
    id: entry.id,
    date_key: entry.dateKey,
    content: entry.content,
    mood: entry.mood ?? null,
    tags: entry.tags,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function tagToRow(tag: PersistedTag) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    usage_count: tag.usageCount,
    last_used_at: tag.lastUsedAt,
    created_at: tag.createdAt,
    updated_at: tag.updatedAt,
  };
}

function preferencesToRow(prefs: PersistedPreferences) {
  return {
    id: prefs.id,
    editor_default_mode_raw: prefs.editorDefaultModeRaw,
    template_style: prefs.templateStyle,
    diary_mode_enabled: prefs.diaryModeEnabled,
    created_at: prefs.createdAt,
    updated_at: prefs.updatedAt,
  };
}

// ── Upsert helpers ───────────────────────────────────────────────────

function getSyncUserId(): string | null {
  const { user, canSync } = getAuthStateSnapshot();
  if (!user || !canSync) {
    return null;
  }

  return user.id;
}

function withUserScope(userId: string, row: Record<string, unknown>) {
  return {
    ...row,
    user_id: userId,
  };
}

async function upsertRows(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const userId = getSyncUserId();
  if (!userId) return;

  const supabase = getSupabaseClient();
  const scopedRows = rows.map((row) => withUserScope(userId, row));
  const { error } = await supabase.from(table).upsert(scopedRows, { onConflict: "user_id,id" });

  if (error) {
    console.error(`[sync] upsert to ${table} failed:`, error.message);
    throw error;
  }
}

// ── Full push sync (local → remote) ─────────────────────────────────

export async function pushAllToRemote(): Promise<void> {
  const userId = getSyncUserId();
  if (!userId) {
    return;
  }

  const [notes, folders, journalEntries, tags, preferences] = await Promise.all([
    listPGliteRecords(PERSISTED_STORE_NAMES.notes),
    listPGliteRecords(PERSISTED_STORE_NAMES.folders),
    listPGliteRecords(PERSISTED_STORE_NAMES.journalEntries),
    listPGliteRecords(PERSISTED_STORE_NAMES.tags),
    listPGliteRecords(PERSISTED_STORE_NAMES.preferences),
  ]);

  await Promise.all([
    upsertRows("notes", notes.map(noteToRow)),
    upsertRows("folders", folders.map(folderToRow)),
    upsertRows("journal_entries", journalEntries.map(journalEntryToRow)),
    upsertRows("tags", tags.map(tagToRow)),
    upsertRows("preferences", preferences.map(preferencesToRow)),
  ]);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${LAST_SYNC_KEY}:${userId}`, new Date().toISOString());
  }

  console.info(
    `[sync] pushed ${notes.length} notes, ${folders.length} folders, ${journalEntries.length} journal entries, ${tags.length} tags, ${preferences.length} preferences`,
  );
}

// ── Single-record push (called after each local write) ───────────────

type SyncableStore =
  | typeof PERSISTED_STORE_NAMES.notes
  | typeof PERSISTED_STORE_NAMES.folders
  | typeof PERSISTED_STORE_NAMES.journalEntries
  | typeof PERSISTED_STORE_NAMES.tags
  | typeof PERSISTED_STORE_NAMES.preferences;

const TABLE_MAP: Record<SyncableStore, string> = {
  [PERSISTED_STORE_NAMES.notes]: "notes",
  [PERSISTED_STORE_NAMES.folders]: "folders",
  [PERSISTED_STORE_NAMES.journalEntries]: "journal_entries",
  [PERSISTED_STORE_NAMES.tags]: "tags",
  [PERSISTED_STORE_NAMES.preferences]: "preferences",
};

type RowMapper = (record: never) => Record<string, unknown>;

const ROW_MAPPER: Record<SyncableStore, RowMapper> = {
  [PERSISTED_STORE_NAMES.notes]: noteToRow as RowMapper,
  [PERSISTED_STORE_NAMES.folders]: folderToRow as RowMapper,
  [PERSISTED_STORE_NAMES.journalEntries]: journalEntryToRow as RowMapper,
  [PERSISTED_STORE_NAMES.tags]: tagToRow as RowMapper,
  [PERSISTED_STORE_NAMES.preferences]: preferencesToRow as RowMapper,
};

export async function pushRecordToRemote(
  storeName: SyncableStore,
  record: Record<string, unknown>,
): Promise<void> {
  if (!getSyncUserId()) {
    return;
  }

  const table = TABLE_MAP[storeName];
  const mapper = ROW_MAPPER[storeName];
  if (!table || !mapper) return;

  try {
    await upsertRows(table, [mapper(record as never)]);
  } catch {
    // Sync failures are non-blocking; data is safe locally
  }
}

export async function deleteRecordFromRemote(
  storeName: SyncableStore,
  recordId: string,
): Promise<void> {
  const userId = getSyncUserId();
  if (!userId) {
    return;
  }

  const table = TABLE_MAP[storeName];
  if (!table) return;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", recordId);

    if (error) {
      console.error(`[sync] soft-delete from ${table} failed:`, error.message);
    }
  } catch {
    // Sync failures are non-blocking
  }
}

export function getLastSyncTime(): string | null {
  if (typeof window === "undefined") return null;
  const userId = getSyncUserId() ?? "privacy";
  return window.localStorage.getItem(`${LAST_SYNC_KEY}:${userId}`);
}

export async function pullAllFromRemote(): Promise<void> {
  // Reserved for a future local merge/pull implementation.
}
