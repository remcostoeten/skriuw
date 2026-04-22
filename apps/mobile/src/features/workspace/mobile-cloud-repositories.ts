import { markdownToRichDocument } from "../../../../../src/shared/lib/rich-document";
import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders/types";
import { fromPersistedFolder } from "@/core/folders/mappers";
import type {
  JournalEntry,
  JournalTag,
  MoodLevel,
} from "@/types/journal";
import type {
  CreateJournalEntryInput,
  CreateJournalTagInput,
  UpdateJournalEntryInput,
} from "@/core/journal/types";
import {
  fromPersistedJournalEntry,
  fromPersistedJournalTag,
} from "@/core/journal/mappers";
import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes/types";
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
import type { NoteFile, NoteFolder, RichTextDocument } from "@/types/notes";
import { getSupabaseClient } from "@/src/core/persistence/supabase";

export type MobileCloudWorkspaceTarget = {
  kind: "cloud";
  workspaceId: string;
  userId: string;
};

export interface MobileNotesRepository {
  list(): Promise<NoteFile[]>;
  create(input: CreateNoteInput): Promise<NoteFile>;
  update(input: UpdateNoteInput): Promise<NoteFile | undefined>;
  destroy(id: NoteId): Promise<void>;
}

export interface MobileFoldersRepository {
  list(): Promise<NoteFolder[]>;
  create(input: CreateFolderInput): Promise<NoteFolder>;
  update(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
  destroy(id: FolderId): Promise<void>;
}

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

type MobileJournalUpdateInput = UpdateJournalEntryInput & {
  dateKey?: DateKey;
};

export interface MobileJournalRepository {
  listEntries(): Promise<JournalEntry[]>;
  createEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
  updateEntry(input: MobileJournalUpdateInput): Promise<JournalEntry | undefined>;
  destroyEntry(id: JournalEntryId): Promise<void>;
  listTags(): Promise<JournalTag[]>;
  createTag(input: CreateJournalTagInput): Promise<JournalTag>;
  destroyTag(id: TagId): Promise<void>;
}

export type MobilePersistenceRepositories = {
  notes: MobileNotesRepository;
  folders: MobileFoldersRepository;
  journal: MobileJournalRepository;
};

const TABLE_MAP: Record<RemoteStoreName, string> = {
  [PERSISTED_STORE_NAMES.notes]: "notes",
  [PERSISTED_STORE_NAMES.folders]: "folders",
  [PERSISTED_STORE_NAMES.journalEntries]: "journal_entries",
  [PERSISTED_STORE_NAMES.tags]: "tags",
};

function toIsoTime(date: Date): IsoTime {
  return date.toISOString() as IsoTime;
}

function toPersistedNote(note: NoteFile): PersistedNote {
  const richContent = note.richContent ?? markdownToRichDocument(note.content);
  const preferredEditorMode = note.preferredEditorMode ?? "block";

  return {
    id: note.id as NoteId,
    name: note.name,
    content: note.content as MarkdownContent,
    richContent,
    preferredEditorMode,
    parentId: note.parentId as FolderId | null,
    createdAt: toIsoTime(note.createdAt),
    updatedAt: toIsoTime(note.modifiedAt),
    journalMeta: note.journalMeta
      ? {
          ...note.journalMeta,
          tags: note.journalMeta.tags.map((tag) => tag as TagName),
        }
      : undefined,
  };
}

function fromPersistedNote(note: PersistedNote): NoteFile {
  const richContent = note.richContent ?? markdownToRichDocument(note.content);
  const preferredEditorMode = note.preferredEditorMode ?? "block";

  return {
    id: note.id,
    name: note.name,
    content: note.content,
    richContent,
    preferredEditorMode,
    parentId: note.parentId,
    createdAt: new Date(note.createdAt),
    modifiedAt: new Date(note.updatedAt),
    journalMeta: note.journalMeta
      ? {
          ...note.journalMeta,
          tags: note.journalMeta.tags.map((tag) => tag as string),
        }
      : undefined,
  };
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

async function listRemoteRecords<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  userId: string,
): Promise<PersistedRecordForStore<TStoreName>[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_MAP[storeName])
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RemoteRowMap[TStoreName][]).map((row) => fromRemoteRow(storeName, row));
}

async function getRemoteRecord<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  id: string,
  userId: string,
): Promise<PersistedRecordForStore<TStoreName> | undefined> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_MAP[storeName])
    .select("*")
    .eq("user_id", userId)
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

async function putRemoteRecord<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const row = toRemoteRow(userId, storeName, record);
  const { error } = await supabase
    .from(TABLE_MAP[storeName])
    .upsert([row], { onConflict: "user_id,id" });

  if (error) {
    throw error;
  }
}

async function softDeleteRemoteRecord<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  id: string,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(TABLE_MAP[storeName])
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function softDeleteRemoteRecords<TStoreName extends RemoteStoreName>(
  storeName: TStoreName,
  ids: string[],
  userId: string,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(TABLE_MAP[storeName])
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", ids);

  if (error) {
    throw error;
  }
}

function collectDescendantFolderIds(
  folders: Array<{ id: FolderId; parentId: FolderId | null }>,
  folderId: FolderId,
): Set<FolderId> {
  const descendants = new Set<FolderId>([folderId]);
  const stack: FolderId[] = [folderId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const folder of folders) {
      if (folder.parentId === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        stack.push(folder.id);
      }
    }
  }

  return descendants;
}

export function createMobileCloudRepositories(
  target: MobileCloudWorkspaceTarget,
): MobilePersistenceRepositories {
  return {
    notes: {
      list: async () => {
        const records = await listRemoteRecords(PERSISTED_STORE_NAMES.notes, target.userId);
        return records.map(fromPersistedNote);
      },
      create: async (input) => {
        const timestamp = input.createdAt ?? new Date();
        const note: NoteFile = {
          id: (input.id ?? crypto.randomUUID()) as NoteId,
          name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
          content: input.content,
          richContent: input.richContent ?? markdownToRichDocument(input.content as string),
          preferredEditorMode: input.preferredEditorMode ?? "block",
          parentId: input.parentId ?? null,
          createdAt: timestamp,
          modifiedAt: input.updatedAt ?? timestamp,
        };
        const persistedNote = toPersistedNote(note);
        await putRemoteRecord(PERSISTED_STORE_NAMES.notes, persistedNote, target.userId);
        return fromPersistedNote(persistedNote);
      },
      update: async (input) => {
        const existing = await getRemoteRecord(PERSISTED_STORE_NAMES.notes, input.id, target.userId);
        if (!existing) {
          return undefined;
        }

        const updated = {
          ...existing,
          name: input.name
            ? input.name.endsWith(".md")
              ? input.name
              : `${input.name}.md`
            : existing.name,
          content: input.content ?? existing.content,
          richContent:
            input.richContent ??
            (input.content !== undefined
              ? markdownToRichDocument(input.content as string)
              : existing.richContent),
          preferredEditorMode: input.preferredEditorMode ?? existing.preferredEditorMode,
          parentId: input.parentId === undefined ? existing.parentId : input.parentId,
          updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
        };

        await putRemoteRecord(PERSISTED_STORE_NAMES.notes, updated, target.userId);
        return fromPersistedNote(updated);
      },
      destroy: (id) => softDeleteRemoteRecord(PERSISTED_STORE_NAMES.notes, id, target.userId),
    },
    folders: {
      list: async () => {
        const records = await listRemoteRecords(PERSISTED_STORE_NAMES.folders, target.userId);
        return records.map((folder) => fromPersistedFolder(folder));
      },
      create: async (input) => {
        const timestamp = input.createdAt ?? new Date();
        const persistedFolder: PersistedFolder = {
          id: (input.id ?? crypto.randomUUID()) as FolderId,
          name: input.name,
          parentId: input.parentId ?? null,
          createdAt: timestamp.toISOString() as IsoTime,
          updatedAt: (input.updatedAt ?? timestamp).toISOString() as IsoTime,
        };

        await putRemoteRecord(PERSISTED_STORE_NAMES.folders, persistedFolder, target.userId);
        return fromPersistedFolder(persistedFolder);
      },
      update: async (input) => {
        const existing = await getRemoteRecord(PERSISTED_STORE_NAMES.folders, input.id, target.userId);
        if (!existing) {
          return undefined;
        }

        const updated = {
          ...existing,
          name: input.name ?? existing.name,
          parentId: input.parentId === undefined ? existing.parentId : input.parentId,
          updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
        };

        await putRemoteRecord(PERSISTED_STORE_NAMES.folders, updated, target.userId);
        return fromPersistedFolder(updated);
      },
      destroy: async (id) => {
        const folders = await listRemoteRecords(PERSISTED_STORE_NAMES.folders, target.userId);
        const descendantIds = collectDescendantFolderIds(folders, id);

        const notes = await listRemoteRecords(PERSISTED_STORE_NAMES.notes, target.userId);
        const noteIdsToDelete = notes
          .filter((note) => note.parentId && descendantIds.has(note.parentId))
          .map((note) => note.id);

        await Promise.all([
          softDeleteRemoteRecords(
            PERSISTED_STORE_NAMES.folders,
            Array.from(descendantIds),
            target.userId,
          ),
          softDeleteRemoteRecords(PERSISTED_STORE_NAMES.notes, noteIdsToDelete, target.userId),
        ]);
      },
    },
    journal: {
      listEntries: async () => {
        const entries = await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, target.userId);
        return entries.map(fromPersistedJournalEntry);
      },
      createEntry: async (input) => {
        const now = input.createdAt ?? new Date();
        const entry: PersistedJournalEntry = {
          id: (input.id ?? crypto.randomUUID()) as JournalEntryId,
          dateKey: input.dateKey,
          content: input.content as MarkdownContent,
          tags: input.tags ?? [],
          mood: input.mood ?? null,
          createdAt: now.toISOString() as IsoTime,
          updatedAt: (input.updatedAt ?? now).toISOString() as IsoTime,
        };

        await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, entry, target.userId);
        return fromPersistedJournalEntry(entry);
      },
      updateEntry: async (input) => {
        const existing = await getRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, input.id, target.userId);
        if (!existing) {
          return undefined;
        }

        const updated: PersistedJournalEntry = {
          ...existing,
          dateKey: input.dateKey ?? existing.dateKey,
          content: (input.content ?? existing.content) as MarkdownContent,
          tags: input.tags ?? existing.tags,
          mood: input.mood === undefined ? existing.mood : input.mood,
          updatedAt: (input.updatedAt ?? new Date()).toISOString() as IsoTime,
        };

        await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, updated, target.userId);
        return fromPersistedJournalEntry(updated);
      },
      destroyEntry: (id) => softDeleteRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, id, target.userId),
      listTags: async () => {
        const tags = await listRemoteRecords(PERSISTED_STORE_NAMES.tags, target.userId);
        return tags.map(fromPersistedJournalTag);
      },
      createTag: async (input) => {
        const now = new Date();
        const tag: PersistedTag = {
          id: (input.id ?? crypto.randomUUID()) as TagId,
          name: input.name,
          color: input.color,
          usageCount: input.usageCount ?? 0,
          lastUsedAt: input.lastUsedAt ?? null,
          createdAt: (input.createdAt ?? now).toISOString() as IsoTime,
          updatedAt: (input.updatedAt ?? now).toISOString() as IsoTime,
        };

        await putRemoteRecord(PERSISTED_STORE_NAMES.tags, tag, target.userId);
        return fromPersistedJournalTag(tag);
      },
      destroyTag: async (id) => {
        const tags = await listRemoteRecords(PERSISTED_STORE_NAMES.tags, target.userId);
        const tag = tags.find((item) => item.id === id);
        if (!tag) {
          return;
        }

        const entries = await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, target.userId);
        const updatedAt = new Date().toISOString() as IsoTime;

        await Promise.all(
          entries
            .filter((entry) => entry.tags.includes(tag.name))
            .map((entry) =>
              putRemoteRecord(
                PERSISTED_STORE_NAMES.journalEntries,
                {
                  ...entry,
                  tags: entry.tags.filter((tagName) => tagName !== tag.name),
                  updatedAt,
                },
                target.userId,
              ),
            ),
        );

        await softDeleteRemoteRecord(PERSISTED_STORE_NAMES.tags, id, target.userId);
      },
    },
  };
}
