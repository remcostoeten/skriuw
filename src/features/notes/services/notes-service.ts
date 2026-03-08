import { NoteFile, NoteFolder } from '@/types/notes';

export class NotesService {
  // File operations
  static createFile(name: string, parentId?: string): NoteFile {
    return {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      content: '',
      parentId: parentId || null,
      createdAt: new Date(),
      modifiedAt: new Date(),
    };
  }

  static updateFileContent(file: NoteFile, content: string): NoteFile {
    return {
      ...file,
      content,
      modifiedAt: new Date(),
    };
  }

  static renameFile(file: NoteFile, name: string): NoteFile {
    return {
      ...file,
      name,
      modifiedAt: new Date(),
    };
  }

  static moveFile(file: NoteFile, parentId?: string): NoteFile {
    return {
      ...file,
      parentId: parentId || null,
      modifiedAt: new Date(),
    };
  }

  // Folder operations
  static createFolder(name: string, parentId?: string): NoteFolder {
    return {
      id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      parentId: parentId || null,
      isOpen: false,
    };
  }

  static renameFolder(folder: NoteFolder, name: string): NoteFolder {
    return {
      ...folder,
      name,
    };
  }

  static moveFolder(folder: NoteFolder, parentId?: string): NoteFolder {
    return {
      ...folder,
      parentId: parentId || null,
    };
  }

  static toggleFolder(folder: NoteFolder): NoteFolder {
    return {
      ...folder,
      isOpen: !folder.isOpen,
    };
  }

  // Utility operations
  static getFilesInFolder(files: NoteFile[], parentId?: string): NoteFile[] {
    return files.filter(file => file.parentId === parentId);
  }

  static getFoldersInFolder(folders: NoteFolder[], parentId?: string): NoteFolder[] {
    return folders.filter(folder => folder.parentId === parentId);
  }

  static countDescendants(folders: NoteFolder[], folderId: string): number {
    const count = (id: string): number => {
      const children = folders.filter(f => f.parentId === id);
      return children.length + children.reduce((sum, child) => sum + count(child.id), 0);
    };
    return count(folderId);
  }

  // Search operations
  static searchFiles(files: NoteFile[], query: string): NoteFile[] {
    if (!query.trim()) return files;
    
    const lowercaseQuery = query.toLowerCase();
    return files.filter(file => 
      file.name.toLowerCase().includes(lowercaseQuery) ||
      file.content.toLowerCase().includes(lowercaseQuery)
    );
  }
}
