import { fromPersistedNote, toPersistedNote } from "@/core/notes";
import { PERSISTED_STORE_NAMES, type NoteId } from "@/core/shared/persistence-types";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import {
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecord,
} from "@/core/persistence/supabase";
import { destroyRecord, getRecord, listRecords, putRecord } from "@/core/storage";
import { getWorkspaceTarget } from "@/platform/persistence/workspace-target";
import { isCloudWorkspaceTarget, type WorkspaceTarget } from "./types";
import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes";
import type { NoteFile } from "@/types/notes";

function resolveTarget(target?: WorkspaceTarget) {
  return target ?? getWorkspaceTarget();
}

export async function listNotes(target?: WorkspaceTarget): Promise<NoteFile[]> {
  const workspaceTarget = resolveTarget(target);
  const records = isCloudWorkspaceTarget(workspaceTarget)
    ? await listRemoteRecords(PERSISTED_STORE_NAMES.notes, workspaceTarget.userId)
    : await listRecords(PERSISTED_STORE_NAMES.notes);
  return records.map(fromPersistedNote);
}

export async function createNote(input: CreateNoteInput, target?: WorkspaceTarget): Promise<NoteFile> {
  const workspaceTarget = resolveTarget(target);
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
  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.notes, persistedNote, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.notes, persistedNote);
  }

  return fromPersistedNote(persistedNote);
}

export async function updateNote(input: UpdateNoteInput, target?: WorkspaceTarget) {
  const workspaceTarget = resolveTarget(target);
  const existing = isCloudWorkspaceTarget(workspaceTarget)
    ? await getRemoteRecord(PERSISTED_STORE_NAMES.notes, input.id, workspaceTarget.userId)
    : await getRecord(PERSISTED_STORE_NAMES.notes, input.id);

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

  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await putRemoteRecord(PERSISTED_STORE_NAMES.notes, updated, workspaceTarget.userId);
  } else {
    await putRecord(PERSISTED_STORE_NAMES.notes, updated);
  }

  return fromPersistedNote(updated);
}

export async function deleteNote(id: NoteId, target?: WorkspaceTarget): Promise<void> {
  const workspaceTarget = resolveTarget(target);
  if (isCloudWorkspaceTarget(workspaceTarget)) {
    await softDeleteRemoteRecord(PERSISTED_STORE_NAMES.notes, id, workspaceTarget.userId);
    return;
  }

  await destroyRecord(PERSISTED_STORE_NAMES.notes, id);
}
