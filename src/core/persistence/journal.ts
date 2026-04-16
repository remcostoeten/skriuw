import { fromPersistedJournalEntry, fromPersistedJournalTag } from "@/core/journal";
import {
  PERSISTED_STORE_NAMES,
  type IsoTime,
  type JournalEntryId,
  type MarkdownContent,
  type PersistedJournalEntry,
  type PersistedTag,
  type TagId,
} from "@/core/shared/persistence-types";
import {
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecord,
} from "@/core/persistence/supabase";
import { destroyRecord, getRecord, listRecords, putRecord } from "@/core/storage";
import { getWorkspaceTarget } from "@/platform/persistence/workspace-target";
import { isCloudWorkspaceTarget, type WorkspaceTarget } from "./types";
import type { CreateJournalEntryInput, CreateJournalTagInput, UpdateJournalEntryInput } from "@/core/journal";

function resolveTarget(target?: WorkspaceTarget) {
  return target ?? getWorkspaceTarget();
}

export async function listJournalEntries(target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const entries = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.journalEntries);

  return entries.map(fromPersistedJournalEntry);
}

export async function createJournalEntry(input: CreateJournalEntryInput, target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
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

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, entry, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.journalEntries, entry);
  }

  return fromPersistedJournalEntry(entry);
}

export async function updateJournalEntry(input: UpdateJournalEntryInput, target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const existing = isCloudWorkspaceTarget(workspaceTarget)
    ? await getRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, input.id, workspaceTarget.userId)
    : await getRecord(PERSISTED_STORE_NAMES.journalEntries, input.id);

  if (!existing) {
    return undefined;
  }

  const updated: PersistedJournalEntry = {
    ...existing,
    content: (input.content ?? existing.content) as MarkdownContent,
    tags: input.tags ?? existing.tags,
    mood: input.mood === undefined ? existing.mood : input.mood,
    updatedAt: (input.updatedAt ?? new Date()).toISOString() as IsoTime,
  };

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, updated, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.journalEntries, updated);
  }

  return fromPersistedJournalEntry(updated);
}

export async function deleteJournalEntry(id: JournalEntryId, target?: WorkspaceTarget): Promise<void> {
  const workspaceTarget = resolveTarget(target);
  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await softDeleteRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, id, workspaceTarget.userId);
    return;
  }

  await destroyRecord(PERSISTED_STORE_NAMES.journalEntries, id);
}

export async function listJournalTags(target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const tags = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.tags, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.tags);

  return tags.map(fromPersistedJournalTag);
}

export async function createJournalTag(input: CreateJournalTagInput, target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
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

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.tags, tag, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.tags, tag);
  }

  return fromPersistedJournalTag(tag);
}

export async function deleteJournalTag(id: TagId, target?: WorkspaceTarget): Promise<void> {
  const workspaceTarget = resolveTarget(target);
  const tags = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.tags, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.tags);

  const tag = tags.find((item) => item.id === id);
  if (!tag) return;

  const entries = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.journalEntries);

  const updatedAt = new Date().toISOString() as IsoTime;

  await Promise.all(
    entries
      .filter((entry) => entry.tags.includes(tag.name))
      .map((entry) =>
        isCloudWorkspaceTarget(workspaceTarget)
          ? putRemoteRecord(
              PERSISTED_STORE_NAMES.journalEntries,
              {
                ...entry,
                tags: entry.tags.filter((tagName) => tagName !== tag.name),
                updatedAt,
              },
              workspaceTarget.userId,
            )
          : putRecord(PERSISTED_STORE_NAMES.journalEntries, {
              ...entry,
              tags: entry.tags.filter((tagName) => tagName !== tag.name),
              updatedAt,
            }),
      ),
  );

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await softDeleteRemoteRecord(PERSISTED_STORE_NAMES.tags, id, workspaceTarget.userId);
  } else {
    await destroyRecord(PERSISTED_STORE_NAMES.tags, id);
  }
}
