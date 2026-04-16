"use client";

import { markdownToRichDocument } from "@/shared/lib/rich-document";
import {
  type CssColorValue,
  type DateKey,
  type FolderId,
  type IsoTime,
  type JournalEntryId,
  type MarkdownContent,
  type NoteId,
  PERSISTED_STORE_NAMES,
  type PersistedFolder,
  type PersistedJournalEntry,
  type PersistedNote,
  type PersistedTag,
  type TagName,
  type TagId,
} from "@/core/shared/persistence-types";
import { buildWebStarterContent } from "@/core/shared/starter-content";
import { listRecords, putRecord } from "@/core/storage";
import { listRemoteRecords, putRemoteRecord } from "@/core/persistence/supabase";

const PRIVACY_DEMO_SEED_VERSION = 1;
const PRIVACY_DEMO_SEED_KEY = `skriuw:privacy-demo-seed:v${PRIVACY_DEMO_SEED_VERSION}`;

function getSeedMarkerKey(workspaceId: string) {
  return `${PRIVACY_DEMO_SEED_KEY}:${workspaceId}`;
}

function buildSeedFolders(): PersistedFolder[] {
  return buildWebStarterContent().folders.map((folder) => ({
    id: folder.id as FolderId,
    name: folder.name,
    parentId: folder.parentId as FolderId | null,
    createdAt: folder.createdAt as IsoTime,
    updatedAt: folder.updatedAt as IsoTime,
  }));
}

function buildSeedNotes(): PersistedNote[] {
  return buildWebStarterContent().notes.map((note) => ({
    id: note.id as NoteId,
    name: note.name,
    content: note.content as MarkdownContent,
    richContent: markdownToRichDocument(note.content),
    preferredEditorMode: note.preferredEditorMode ?? "block",
    parentId: note.parentId as FolderId | null,
    createdAt: note.createdAt as IsoTime,
    updatedAt: note.updatedAt as IsoTime,
    journalMeta: note.journalMeta
      ? {
          ...note.journalMeta,
          tags: note.journalMeta.tags as TagName[],
        }
      : undefined,
  }));
}

function buildSeedTags(): PersistedTag[] {
  return buildWebStarterContent().tags.map((tag) => ({
    id: tag.id as TagId,
    name: tag.name as TagName,
    color: tag.color as CssColorValue,
    usageCount: tag.usageCount,
    lastUsedAt: tag.lastUsedAt as IsoTime | null,
    createdAt: tag.createdAt as IsoTime,
    updatedAt: tag.updatedAt as IsoTime,
  }));
}

function buildSeedJournalEntries(): PersistedJournalEntry[] {
  return buildWebStarterContent().journalEntries.map((entry) => ({
    id: entry.id as JournalEntryId,
    dateKey: entry.dateKey as DateKey,
    content: entry.content as MarkdownContent,
    mood: entry.mood,
    tags: entry.tags as TagName[],
    createdAt: entry.createdAt as IsoTime,
    updatedAt: entry.updatedAt as IsoTime,
  }));
}

export async function ensurePrivacyDemoSeeded(workspaceId: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const markerKey = getSeedMarkerKey(workspaceId);

  if (window.localStorage.getItem(markerKey) === "1") {
    return;
  }

  const [notes, folders, entries, tags] = await Promise.all([
    listRecords(PERSISTED_STORE_NAMES.notes),
    listRecords(PERSISTED_STORE_NAMES.folders),
    listRecords(PERSISTED_STORE_NAMES.journalEntries),
    listRecords(PERSISTED_STORE_NAMES.tags),
  ]);

  if (notes.length > 0 || folders.length > 0 || entries.length > 0 || tags.length > 0) {
    window.localStorage.setItem(markerKey, "1");
    return;
  }

  await Promise.all([
    ...buildSeedFolders().map((folder) => putRecord(PERSISTED_STORE_NAMES.folders, folder)),
    ...buildSeedNotes().map((note) => putRecord(PERSISTED_STORE_NAMES.notes, note)),
    ...buildSeedTags().map((tag) => putRecord(PERSISTED_STORE_NAMES.tags, tag)),
    ...buildSeedJournalEntries().map((entry) =>
      putRecord(PERSISTED_STORE_NAMES.journalEntries, entry),
    ),
  ]);

  window.localStorage.setItem(markerKey, "1");
}

export async function ensureCloudStarterContentSeeded(userId: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const [folders, notes, tags, entries] = await Promise.all([
    listRemoteRecords(PERSISTED_STORE_NAMES.folders, userId),
    listRemoteRecords(PERSISTED_STORE_NAMES.notes, userId),
    listRemoteRecords(PERSISTED_STORE_NAMES.tags, userId),
    listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, userId),
  ]);

  const seedFolders = buildSeedFolders();
  const seedNotes = buildSeedNotes();
  const seedTags = buildSeedTags();
  const seedEntries = buildSeedJournalEntries();
  const { markerNoteId } = buildWebStarterContent();
  const folderIds = new Set(seedFolders.map((folder) => folder.id));
  const noteIds = new Set(seedNotes.map((note) => note.id));
  const tagIds = new Set(seedTags.map((tag) => tag.id));
  const entryIds = new Set(seedEntries.map((entry) => entry.id));
  const hasExistingStarterData =
    folders.some((folder) => folderIds.has(folder.id)) ||
    notes.some((note) => noteIds.has(note.id)) ||
    tags.some((tag) => tagIds.has(tag.id)) ||
    entries.some((entry) => entryIds.has(entry.id));

  const hasForeignData =
    folders.some((folder) => !folderIds.has(folder.id)) ||
    notes.some((note) => !noteIds.has(note.id)) ||
    tags.some((tag) => !tagIds.has(tag.id)) ||
    entries.some((entry) => !entryIds.has(entry.id));

  if (hasForeignData || hasExistingStarterData) {
    return;
  }

  await Promise.all([
    ...seedFolders.map((folder) => putRemoteRecord(PERSISTED_STORE_NAMES.folders, folder, userId)),
    ...seedNotes
      .filter((note) => note.id !== markerNoteId)
      .map((note) => putRemoteRecord(PERSISTED_STORE_NAMES.notes, note, userId)),
    ...seedTags.map((tag) => putRemoteRecord(PERSISTED_STORE_NAMES.tags, tag, userId)),
    ...seedEntries.map((entry) =>
      putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, entry, userId),
    ),
  ]);

  await putRemoteRecord(
    PERSISTED_STORE_NAMES.notes,
    seedNotes.find((note) => note.id === markerNoteId) ?? seedNotes[0],
    userId,
  );
}
