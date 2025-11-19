import { eq } from 'drizzle-orm';
import { getDb } from './index';
import { notes, folders } from './schema';
import { mapNote, mapFolder } from '../../shared/db/mappers';
import type { CreateNoteData, UpdateNoteData, CreateFolderData } from '../../shared/db/types';
import { findNote } from './queries';

const DEFAULT_CONTENT = [{ id: '1', type: 'paragraph', props: {}, content: [], children: [] }];

export async function createNote(data: CreateNoteData) {
  const db = getDb();
  const now = Date.now();
  const noteId = `note-${now}`;

  const [created] = await db.insert(notes).values({
    id: noteId,
    name: data.name,
    content: JSON.stringify(data.content || DEFAULT_CONTENT),
    folderId: data.parentFolderId || null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return mapNote(created);
}

export async function createFolder(data: CreateFolderData) {
  const db = getDb();
  const now = Date.now();
  const folderId = `folder-${now}`;

  const [created] = await db.insert(folders).values({
    id: folderId,
    name: data.name,
    parentId: data.parentFolderId || null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return {
    ...created,
    type: 'folder' as const,
    children: [],
  };
}

export async function updateNote(id: string, data: UpdateNoteData) {
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: Date.now() };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.content !== undefined) updateData.content = JSON.stringify(data.content);

  const [updated] = await db.update(notes).set(updateData).where(eq(notes.id, id)).returning();
  return updated ? mapNote(updated) : undefined;
}

export async function renameItem(id: string, newName: string) {
  const db = getDb();
  const now = Date.now();

  const [noteRow] = await db.update(notes)
    .set({ name: newName, updatedAt: now })
    .where(eq(notes.id, id))
    .returning();

  if (noteRow) return mapNote(noteRow);

  const [folderRow] = await db.update(folders)
    .set({ name: newName, updatedAt: now })
    .where(eq(folders.id, id))
    .returning();

  if (folderRow) return { ...folderRow, type: 'folder' as const, children: [] };
  return undefined;
}

export async function deleteItem(id: string): Promise<boolean> {
  const db = getDb();

  const [noteDeleted] = await db.delete(notes).where(eq(notes.id, id)).returning();
  if (noteDeleted) return true;

  const [folderDeleted] = await db.delete(folders).where(eq(folders.id, id)).returning();
  return !!folderDeleted;
  }

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
  const db = getDb();
  const now = Date.now();

  const [noteRow] = await db.update(notes)
    .set({ folderId: targetFolderId, updatedAt: now })
    .where(eq(notes.id, itemId))
    .returning();

  if (noteRow) return true;

  const [folderRow] = await db.update(folders)
    .set({ parentId: targetFolderId, updatedAt: now })
    .where(eq(folders.id, itemId))
    .returning();

  return !!folderRow;
}

export async function countChildren(folderId: string): Promise<number> {
  const db = getDb();
  const childFolders = await db.select().from(folders).where(eq(folders.parentId, folderId));
  const childNotes = await db.select().from(notes).where(eq(notes.folderId, folderId));
  return childFolders.length + childNotes.length;
}



