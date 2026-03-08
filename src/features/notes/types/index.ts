import { NoteFile as BaseNoteFile, NoteFolder as BaseNoteFolder } from "@/types/notes";

export interface NoteFile extends BaseNoteFile {
  folderId?: string;
  editorMode?: 'markdown' | 'richtext';
  tags?: string[];
  mood?: string;
  lastModified?: Date;
}

export interface NoteFolder extends BaseNoteFolder {
  isOpen: boolean;
}

// Override the base interface to match existing structure
export interface ExtendedNoteFile extends BaseNoteFile {
  folderId?: string;
  editorMode?: 'markdown' | 'richtext';
  tags?: string[];
  mood?: string;
  lastModified?: Date;
}

export type EditorMode = 'markdown' | 'richtext';

export interface NotesState {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string | null;
}

export interface NotesActions {
  // File operations
  createFile: (name: string) => void;
  updateFileContent: (id: string, content: string) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, name: string) => void;
  moveFile: (id: string, folderId?: string) => void;
  setActiveFileId: (id: string) => void;
  
  // Folder operations
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  moveFolder: (id: string, parentId?: string) => void;
  toggleFolder: (id: string) => void;
  
  // Utility operations
  getFilesInFolder: (folderId?: string) => NoteFile[];
  getFoldersInFolder: (folderId?: string) => NoteFolder[];
  countDescendants: (folderId: string) => number;
}
