import { eq, isNull } from 'drizzle-orm';
import { getDb } from './index';
import { notes, folders } from './schema';
import { mapNote, mapFolder } from '../../shared/db/mappers';
import type { Item } from '../../shared/db/types';

export async function getItems(): Promise<Item[]> {
  const db = getDb();

  const rootFolders = await db.select().from(folders).where(isNull(folders.parentId));
  const rootNotes = await db.select().from(notes).where(isNull(notes.folderId));

  const items: Item[] = [
    ...(await Promise.all(rootFolders.map(f => mapFolder(f, getChildren)))),
    ...rootNotes.map(mapNote),
  ];

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function findItemById(id: string): Promise<Item | undefined> {
  const db = getDb();

  const [noteRow] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  if (noteRow) return mapNote(noteRow);

  const [folderRow] = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  if (folderRow) return mapFolder(folderRow, getChildren);

  return undefined;
}

export async function findNote(id: string) {
  const db = getDb();
  const [noteRow] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return noteRow ? mapNote(noteRow) : undefined;
}

async function getChildren(folderId: string): Promise<Item[]> {
  const db = getDb();
  const childFolders = await db.select().from(folders).where(eq(folders.parentId, folderId));
  const childNotes = await db.select().from(notes).where(eq(notes.folderId, folderId));

  return [
    ...(await Promise.all(childFolders.map(f => mapFolder(f, getChildren)))),
    ...childNotes.map(mapNote),
  ];
}
