export interface NoteFile {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
  modifiedAt: Date;
  parentId: string | null;
}

export interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  isOpen: boolean;
}

export type SidebarItem = 
  | { type: 'file'; data: NoteFile }
  | { type: 'folder'; data: NoteFolder; children: SidebarItem[] };
