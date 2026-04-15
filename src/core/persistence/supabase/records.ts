"use client";

import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { getAuthStateSnapshot } from "@/platform/auth";
import { getSupabaseClient } from "./client";
import {
  PERSISTED_STORE_NAMES,
  type CssColorValue,
  type DateKey,
  type FolderId,
  type IsoTime,
  type JournalEntryId,
  type MarkdownContent,
  type NoteId,
  type PersistedFolder,
  type PersistedJournalEntry,
  type PersistedNote,
  type PersistedRecordForStore,
  type PersistedTag,
  type TagId,
  type TagName,
} from "@/core/shared/persistence-types";
import type { RichTextDocument } from "@/types/notes";
import type { MoodLevel } from "@/types/journal";

type RemoteBaseRow = {
  user_id: string;
  id: string;
  deleted_at: string | null;
};

type RemoteNoteRow = RemoteBaseRow & {
  name: string;
  content: string;
  rich_content: RichTextDocument | null;
  preferred_editor_mode: "raw" | "block" | null;
  parent_id: string | null;
  journal_meta:
    | {
        mood?: MoodLevel;
        tags: string[];
        weather?: string;
        location?: string;
      }
    | null;
  created_at: string;
  updated_at: string;
};

type RemoteFolderRow = RemoteBaseRow & {
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteJournalEntryRow = RemoteBaseRow & {
  date_key: string;
  content: string;
  mood: MoodLevel | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type RemoteTagRow = RemoteBaseRow & {
  name: string;
  color: string;
  usage_count: number | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteRowMap = {
  [PERSISTED_STORE_NAMES.notes]: RemoteNoteRow;
  [PERSISTED_STORE_NAMES.folders]: RemoteFolderRow;
  [PERSISTED_STORE_NAMES.journalEntries]: RemoteJournalEntryRow;
  [PERSISTED_STORE_NAMES.tags]: RemoteTagRow;
};

type RemoteStoreName = keyof RemoteRowMap;

const TABLE_MAP: Record<RemoteStoreName, string> = {
  [PERSISTED_STORE_NAMES.notes]: "notes",
  [PERSISTED_STORE_NAMES.folders]: "folders",
  [PERSISTED_STORE_NAMES.journalEntries]: "journal_entries",
  [PERSISTED_STORE_NAMES.tags]: "tags",
};

function requireUserId(userId: string | undefined): string {
  if (!userId) {
    throw new Error("Explicit user id required for cloud storage.");
  }

  return userId;
}

export function getRemotePersistenceUserId(): string | null {
  const { user, phase } = getAuthStateSnapshot();
  if (!user || phase !== "authenticated") {
    return null;
  }

  return user.id;
}

export function canUseRemotePersistence(): boolean {
  return getRemotePersistenceUserId() !== null;
}

function noteToRow(userId: string, note: PersistedNote): RemoteNoteRow {
  return {
    user_id: userId,
    id: note.id,
    name: note.name,
    content: note.content,
    rich_content: note.richContent,
    preferred_editor_mode: note.preferredEditorMode,
    parent_id: note.parentId,
    journal_meta: note.journalMeta
      ? {
          ...note.journalMeta,
          tags: note.journalMeta.tags.map((tag) => tag as string),
        }
      : null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted_at: null,
  };
}

function rowToNote(row: RemoteNoteRow): PersistedNote {
  return {
    id: row.id as NoteId,
    name: row.name,
    content: row.content as MarkdownContent,
    richContent: row.rich_content ?? markdownToRichDocument(row.content),
    preferredEditorMode: row.preferred_editor_mode ?? "block",
    parentId: row.parent_id as FolderId | null,
    journalMeta: row.journal_meta
      ? {
          ...row.journal_meta,
          tags: row.journal_meta.tags.map((tag) => tag as TagName),
        }
      : undefined,
    createdAt: row.created_at as IsoTime,
    updatedAt: row.updated_at as IsoTime,
  };
}

function folderToRow(userId: string, folder: PersistedFolder): RemoteFolderRow {
  return {
    user_id: userId,
    id: folder.id,
    name: folder.name,
    parent_id: folder.parentId,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
    deleted_at: null,
  };
}

function rowToFolder(row: RemoteFolderRow): PersistedFolder {
  return {
    id: row.id as FolderId,
    name: row.name,
    parentId: row.parent_id as FolderId | null,
    createdAt: row.created_at as IsoTime,
    updatedAt: row.updated_at as IsoTime,
  };
}

function journalEntryToRow(userId: string, entry: PersistedJournalEntry): RemoteJournalEntryRow {
  return {
    user_id: userId,
    id: entry.id,
    date_key: entry.dateKey,
    content: entry.content,
    mood: entry.mood ?? null,
    tags: entry.tags.map((tag) => tag as string),
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    deleted_at: null,
  };
}

function rowToJournalEntry(row: RemoteJournalEntryRow): PersistedJournalEntry {
  return {
    id: row.id as JournalEntryId,
    dateKey: row.date_key as DateKey,
    content: row.content as MarkdownContent,
    mood: row.mood ?? null,
    tags: (row.tags ?? []).map((tag) => tag as TagName),
    createdAt: row.created_at as IsoTime,
    updatedAt: row.updated_at as IsoTime,
  };
}

function tagToRow(userId: string, tag: PersistedTag): RemoteTagRow {
  return {
    user_id: userId,
    id: tag.id,
    name: tag.name,
    color: tag.color,
    usage_count: tag.usageCount,
    last_used_at: tag.lastUsedAt,
    created_at: tag.createdAt,
    updated_at: tag.updatedAt,
    deleted_at: null,
  };
}

function rowToTag(row: RemoteTagRow): PersistedTag {
  return {
    id: row.id as TagId,
    name: row.name as TagName,
    color: row.color as CssColorValue,
    usageCount: row.usage_count ?? 0,
    lastUsedAt: (row.last_used_at as IsoTime | null) ?? null,
    createdAt: row.created_at as IsoTime,
    updatedAt: row.updated_at as IsoTime,
  };
}

function toRemoteRow<TStoreName extends RemoteStoreName>(
  userId: string,
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
): RemoteRowMap[TStoreName] {
  switch (storeName) {
    case PERSISTED_STORE_NAMES.notes:
      return noteToRow(userId, record as PersistedNote) as RemoteRowMap[TStoreName];
    case PERSISTED_STORE_NAMES.folders:
      return folderToRow(userId, record as PersistedFolder) as RemoteRowMap[TStoreName];
    case PERSISTED_STORE_NAMES.journalEntries:
      return journalEntryToRow(userId, record as PersistedJournalEntry) as RemoteRowMap[TStoreName];
    case PERSISTED_STORE_NAMES.tags:
      return tagToRow(userId, record as PersistedTag) as RemoteRowMap[TStoreName];
    default:
      throw new Error(`Unsupported remote store: ${String(storeName)}`);
  }
}

function fromRemoteRow<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  row: RemoteRowMap[TStoreName],
): PersistedRecordForStore<TStoreName> {
  switch (storeName) {
    case PERSISTED_STORE_NAMES.notes:
      return rowToNote(row as RemoteNoteRow) as PersistedRecordForStore<TStoreName>;
    case PERSISTED_STORE_NAMES.folders:
      return rowToFolder(row as RemoteFolderRow) as PersistedRecordForStore<TStoreName>;
    case PERSISTED_STORE_NAMES.journalEntries:
      return rowToJournalEntry(row as RemoteJournalEntryRow) as PersistedRecordForStore<TStoreName>;
    case PERSISTED_STORE_NAMES.tags:
      return rowToTag(row as RemoteTagRow) as PersistedRecordForStore<TStoreName>;
    default:
      throw new Error(`Unsupported remote store: ${String(storeName)}`);
  }
}

export async function listRemoteRecords<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  userId?: string,
): Promise<PersistedRecordForStore<TStoreName>[]> {
  const scopedUserId = requireUserId(userId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_MAP[storeName])
    .select("*")
    .eq("user_id", scopedUserId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RemoteRowMap[TStoreName][]).map((row) => fromRemoteRow(storeName, row));
}

export async function getRemoteRecord<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  id: string,
  userId?: string,
): Promise<PersistedRecordForStore<TStoreName> | undefined> {
  const scopedUserId = requireUserId(userId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_MAP[storeName])
    .select("*")
    .eq("user_id", scopedUserId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return undefined;
  }

  return fromRemoteRow(storeName, data as RemoteRowMap[TStoreName]);
}

export async function putRemoteRecord<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
  userId?: string,
): Promise<void> {
  const scopedUserId = requireUserId(userId);
  const supabase = getSupabaseClient();
  const row = toRemoteRow(scopedUserId, storeName, record);
  const { error } = await supabase
    .from(TABLE_MAP[storeName])
    .upsert([row], { onConflict: "user_id,id" });

  if (error) {
    throw error;
  }
}

export async function softDeleteRemoteRecord<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  id: string,
  userId?: string,
): Promise<void> {
  const scopedUserId = requireUserId(userId);
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(TABLE_MAP[storeName])
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", scopedUserId)
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function softDeleteRemoteRecords<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  ids: string[],
  userId?: string,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const scopedUserId = requireUserId(userId);
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(TABLE_MAP[storeName])
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", scopedUserId)
    .in("id", ids);

  if (error) {
    throw error;
  }
}

export type { RemoteStoreName };
