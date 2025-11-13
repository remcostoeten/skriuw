import { eq, isNull, desc } from 'drizzle-orm';
import { getDb } from './db';
import { notes, folders } from './schema';
import type { Note, Folder, Item } from '@/features/notes/types';
import type { Block } from '@blocknote/core';

/**
 * Get all items (notes and folders) in hierarchical structure
 */
export async function getItems(): Promise<Item[]> {
  const db = getDb();

  // Get root folders and notes
  const rootFolders = await db.select().from(folders).where(isNull(folders.parentId));
  const rootNotes = await db.select().from(notes).where(isNull(notes.folderId));

  const items: Item[] = [];

  // Process folders recursively
  for (const folderRow of rootFolders) {
    items.push(await mapFolderToItem(folderRow));
  }

  // Add root notes
  for (const noteRow of rootNotes) {
    items.push(mapNoteToItem(noteRow));
  }

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Find item by ID (note or folder)
 */
export async function findItemById(id: string): Promise<Item | undefined> {
  const db = getDb();

  // Try note first
  const noteRows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  if (noteRows.length > 0) {
    return mapNoteToItem(noteRows[0]);
  }

  // Try folder
  const folderRows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  if (folderRows.length > 0) {
    return await mapFolderToItem(folderRows[0]);
  }

  return undefined;
}

/**
 * Find note by ID
 */
export async function findNote(id: string): Promise<Note | undefined> {
  const db = getDb();
  const noteRows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  if (noteRows.length > 0) {
    return mapNoteToItem(noteRows[0]) as Note;
  }
  return undefined;
}

/**
 * Helper: Map database row to Note
 */
function mapNoteToItem(noteRow: typeof notes.$inferSelect): Note {
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
 * Helper: Map database row to Folder (recursive)
 */
async function mapFolderToItem(folderRow: typeof folders.$inferSelect): Promise<Folder> {
  const db = getDb();

  // Fetch children
  const childFolders = await db.select().from(folders).where(eq(folders.parentId, folderRow.id));
  const childNotes = await db.select().from(notes).where(eq(notes.folderId, folderRow.id));

  const children: Item[] = [
    ...(await Promise.all(childFolders.map(f => mapFolderToItem(f)))),
    ...childNotes.map(n => mapNoteToItem(n)),
  ];

  return {
    id: folderRow.id,
    name: folderRow.name,
    type: 'folder',
    children,
    createdAt: folderRow.createdAt,
    updatedAt: folderRow.updatedAt,
  };
}



