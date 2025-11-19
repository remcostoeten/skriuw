import type { Block } from '@blocknote/core';
import type { Note, Folder, Item } from './types';
import type { NoteRow, FolderRow } from './schema';

export function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    name: row.name,
    content: JSON.parse(row.content) as Block[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: 'note',
  };
}

export async function mapFolder(
  row: FolderRow,
  getChildren: (folderId: string) => Promise<Item[]>
): Promise<Folder> {
  const children = await getChildren(row.id);
  return {
    id: row.id,
    name: row.name,
    type: 'folder',
    children,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

