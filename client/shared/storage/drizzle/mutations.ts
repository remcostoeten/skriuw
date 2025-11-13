import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { notes, folders } from './schema';
import type { Note, Folder, CreateNoteData, UpdateNoteData, CreateFolderData } from '@/features/notes/types';
import type { Block } from '@blocknote/core';

/**
 * Create a new note
 */
export async function createNote(data: CreateNoteData): Promise<Note> {
  const db = getDb();
  const now = Date.now();
  const noteId = `note-${now}`;
  const content = data.content || [
    {
      id: "1",
      type: "paragraph",
      props: {},
      content: [],
      children: [],
    } as Block,
  ];

  await db.insert(notes).values({
    id: noteId,
    name: data.name,
    content: JSON.stringify(content),
    folderId: data.parentFolderId || null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: noteId,
    name: data.name,
    content,
    createdAt: now,
    updatedAt: now,
    type: 'note',
  };
}

/**
 * Create a new folder
 */
export async function createFolder(data: CreateFolderData): Promise<Folder> {
  const db = getDb();
  const now = Date.now();
  const folderId = `folder-${now}`;

  await db.insert(folders).values({
    id: folderId,
    name: data.name,
    parentId: data.parentFolderId || null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: folderId,
    name: data.name,
    type: 'folder',
    children: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a note
 */
export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
  const db = getDb();

  const updateData: any = {
    updatedAt: Date.now(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.content !== undefined) updateData.content = JSON.stringify(data.content);

  const updated = await db.update(notes)
    .set(updateData)
    .where(eq(notes.id, id))
    .returning();

  if (updated.length === 0) {
    return undefined;
  }

  const noteRow = updated[0];
  return {
    id: noteRow.id,
    name: noteRow.name,
    content: JSON.parse(noteRow.content) as Block[],
    createdAt: noteRow.createdAt,
    updatedAt: noteRow.updatedAt,
    type: 'note',
  };
}

/**
 * Rename an item (note or folder)
 */
export async function renameItem(id: string, newName: string): Promise<Note | Folder | undefined> {
  const db = getDb();

  // Try note first
  const noteUpdated = await db.update(notes)
    .set({ name: newName, updatedAt: Date.now() })
    .where(eq(notes.id, id))
    .returning();

  if (noteUpdated.length > 0) {
    const noteRow = noteUpdated[0];
    return {
      id: noteRow.id,
      name: noteRow.name,
      content: JSON.parse(noteRow.content) as Block[],
      createdAt: noteRow.createdAt,
      updatedAt: noteRow.updatedAt,
      type: 'note',
    };
  }

  // Try folder
  const folderUpdated = await db.update(folders)
    .set({ name: newName, updatedAt: Date.now() })
    .where(eq(folders.id, id))
    .returning();

  if (folderUpdated.length > 0) {
    const folderRow = folderUpdated[0];
    return {
      id: folderRow.id,
      name: folderRow.name,
      type: 'folder',
      children: [],
      createdAt: folderRow.createdAt,
      updatedAt: folderRow.updatedAt,
    };
  }

  return undefined;
}

/**
 * Delete an item (note or folder)
 */
export async function deleteItem(id: string): Promise<boolean> {
  const db = getDb();

  // Try note first
  const noteDeleted = await db.delete(notes).where(eq(notes.id, id)).returning();
  if (noteDeleted.length > 0) {
    return true;
  }

  // Try folder (cascade will handle children)
  const folderDeleted = await db.delete(folders).where(eq(folders.id, id)).returning();
  if (folderDeleted.length > 0) {
    return true;
  }

  return false;
}

/**
 * Move an item to a different folder
 */
export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
  const db = getDb();

  // Try note first
  const noteUpdated = await db.update(notes)
    .set({ folderId: targetFolderId, updatedAt: Date.now() })
    .where(eq(notes.id, itemId))
    .returning();

  if (noteUpdated.length > 0) {
    return true;
  }

  // Try folder
  const folderUpdated = await db.update(folders)
    .set({ parentId: targetFolderId, updatedAt: Date.now() })
    .where(eq(folders.id, itemId))
    .returning();

  if (folderUpdated.length > 0) {
    return true;
  }

  return false;
}

/**
 * Count children of a folder
 */
export async function countChildren(folderId: string): Promise<number> {
  const db = getDb();
  const childFolders = await db.select().from(folders).where(eq(folders.parentId, folderId));
  const childNotes = await db.select().from(notes).where(eq(notes.folderId, folderId));
  return childFolders.length + childNotes.length;
}



