import { fromPersistedFolder } from "@/core/folders";
import {
  PERSISTED_STORE_NAMES,
  type FolderId,
  type IsoTime,
  type PersistedFolder,
} from "@/core/shared/persistence-types";
import {
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecords,
} from "@/core/persistence/supabase";
import { destroyRecord, getRecord, listRecords, putRecord } from "@/core/storage";
import { getWorkspaceTarget } from "@/platform/persistence/workspace-target";
import { isCloudWorkspaceTarget, type WorkspaceTarget } from "./types";
import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";

function resolveTarget(target?: WorkspaceTarget) {
  return target ?? getWorkspaceTarget();
}

function collectDescendantFolderIds(
  folders: Array<{ id: FolderId; parentId: FolderId | null }>,
  folderId: FolderId,
): Set<FolderId> {
  const descendants = new Set<FolderId>([folderId]);
  const stack: FolderId[] = [folderId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const folder of folders) {
      if (folder.parentId === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        stack.push(folder.id);
      }
    }
  }

  return descendants;
}

export async function listFolders(target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const records = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.folders);

  return records.map((folder) => fromPersistedFolder(folder));
}

export async function createFolder(input: CreateFolderInput, target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const timestamp = input.createdAt ?? new Date();
  const persistedFolder: PersistedFolder = {
    id: (input.id ?? crypto.randomUUID()) as FolderId,
    name: input.name,
    parentId: input.parentId ?? null,
    createdAt: timestamp.toISOString() as IsoTime,
    updatedAt: (input.updatedAt ?? timestamp).toISOString() as IsoTime,
  };

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.folders, persistedFolder, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.folders, persistedFolder);
  }

  return fromPersistedFolder(persistedFolder);
}

export async function updateFolder(input: UpdateFolderInput, target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const existing = isCloudWorkspaceTarget(workspaceTarget)
    ? await getRemoteRecord(PERSISTED_STORE_NAMES.folders, input.id, workspaceTarget.userId)
    : await getRecord(PERSISTED_STORE_NAMES.folders, input.id);

  if (!existing) {
    return undefined;
  }

  const updated = {
    ...existing,
    name: input.name ?? existing.name,
    parentId: input.parentId === undefined ? existing.parentId : input.parentId,
    updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
  };

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.folders, updated, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.folders, updated);
  }

  return fromPersistedFolder(updated);
}

export async function deleteFolder(id: FolderId, target?: WorkspaceTarget): Promise<void> {
  const workspaceTarget = resolveTarget(target);
  const folders = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.folders);

  const descendantIds = collectDescendantFolderIds(folders, id);

  const notes = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.notes, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.notes);

  const noteIdsToDelete = notes
    .filter((note) => note.parentId && descendantIds.has(note.parentId))
    .map((note) => note.id);

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await Promise.all([
      softDeleteRemoteRecords(
        PERSISTED_STORE_NAMES.folders,
        Array.from(descendantIds),
        workspaceTarget.userId,
      ),
      softDeleteRemoteRecords(PERSISTED_STORE_NAMES.notes, noteIdsToDelete, workspaceTarget.userId),
    ]);
    return;
  }

  await Promise.all([
    ...Array.from(descendantIds).map((folderId) => destroyRecord(PERSISTED_STORE_NAMES.folders, folderId)),
    ...noteIdsToDelete.map((noteId) => destroyRecord(PERSISTED_STORE_NAMES.notes, noteId)),
  ]);
}
