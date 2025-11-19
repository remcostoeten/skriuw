import type { Block } from '@blocknote/core';

export type Note = {
  id: string;
  name: string;
  content: Block[];
  createdAt: number;
  updatedAt: number;
  type: 'note';
};

export type Folder = {
  id: string;
  name: string;
  type: 'folder';
  children: Item[];
  createdAt: number;
  updatedAt: number;
};

export type Item = Note | Folder;

export type CreateNoteData = {
  name: string;
  content?: Block[];
  parentFolderId?: string;
};

export type UpdateNoteData = {
  name?: string;
  content?: Block[];
};

export type CreateFolderData = {
  name: string;
  parentFolderId?: string;
};

