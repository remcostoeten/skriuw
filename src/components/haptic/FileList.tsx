'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { NoteFile, NoteFolder } from '@/types/notes';
import { ChevronRight, Folder, Pencil, Trash2, FolderInput } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';

interface FileListProps {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onRenameFile: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveFile: (fileId: string, newParentId: string | null) => void;
  onMoveFolder: (folderId: string, newParentId: string | null) => void;
  getFilesInFolder: (parentId: string | null) => NoteFile[];
  getFoldersInFolder: (parentId: string | null) => NoteFolder[];
  countDescendants: (folderId: string) => number;
}

export function FileList({
  folders,
  activeFileId,
  onFileSelect,
  onToggleFolder,
  onRenameFile,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  getFilesInFolder,
  getFoldersInFolder,
  countDescendants,
}: FileListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<'file' | 'folder'>('file');

  const startRename = (id: string, currentName: string, type: 'file' | 'folder') => {
    setEditingId(id);
    setEditingName(type === 'file' ? currentName.replace('.md', '') : currentName);
    setEditingType(type);
  };

  const finishRename = () => {
    if (editingId && editingName.trim()) {
      if (editingType === 'file') {
        onRenameFile(editingId, editingName.trim());
      } else {
        onRenameFolder(editingId, editingName.trim());
      }
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      finishRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  // Get all folders for "Move to" submenu
  const allFolders = folders;

  const renderMoveToSubmenu = (currentId: string, currentParentId: string | null, type: 'file' | 'folder') => {
    const availableFolders = type === 'folder'
      ? allFolders.filter(f => f.id !== currentId && f.parentId !== currentId)
      : allFolders;

    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger className="gap-2">
          <FolderInput className="w-4 h-4" />
          Move to
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48">
          {currentParentId !== null && (
            <ContextMenuItem
              onClick={() => type === 'file' ? onMoveFile(currentId, null) : onMoveFolder(currentId, null)}
            >
              Root
            </ContextMenuItem>
          )}
          {availableFolders.map(folder => (
            folder.id !== currentParentId && (
              <ContextMenuItem
                key={folder.id}
                onClick={() => type === 'file' ? onMoveFile(currentId, folder.id) : onMoveFolder(currentId, folder.id)}
              >
                {folder.name}
              </ContextMenuItem>
            )
          ))}
          {availableFolders.length === 0 && currentParentId === null && (
            <ContextMenuItem disabled>No folders available</ContextMenuItem>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  };

  const renderFolder = (folder: NoteFolder, depth: number = 0) => {
    const childFolders = getFoldersInFolder(folder.id);
    const childFiles = getFilesInFolder(folder.id);
    const totalCount = countDescendants(folder.id);
    const isEditing = editingId === folder.id;

    return (
      <div key={folder.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={() => onToggleFolder(folder.id)}
              className="w-full flex items-center gap-1.5 h-[30px] text-[13px] text-foreground/70 hover:bg-theme-hover transition-colors group"
              style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
            >
              <ChevronRight
                className={cn(
                  'w-3 h-3 shrink-0 transition-transform text-theme-dim',
                  folder.isOpen && 'rotate-90'
                )}
                strokeWidth={1.5}
              />
              <Folder className="w-[15px] h-[15px] shrink-0 text-theme-dim" strokeWidth={1.5} />
              {isEditing ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-background border border-border rounded px-1 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              ) : (
                <span className="flex-1 text-left truncate">{folder.name}</span>
              )}
              <span className="text-xs text-theme-dim tabular-nums">{totalCount}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem
              onClick={() => startRename(folder.id, folder.name, 'folder')}
              className="gap-2"
            >
              <Pencil className="w-4 h-4" />
              Rename
            </ContextMenuItem>
            {renderMoveToSubmenu(folder.id, folder.parentId, 'folder')}
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDeleteFolder(folder.id)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {folder.isOpen && (
          <div>
            {childFolders.map(f => renderFolder(f, depth + 1))}
            {childFiles.map(f => renderFile(f, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file: NoteFile, depth: number = 0) => {
    const isEditing = editingId === file.id;

    return (
      <ContextMenu key={file.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => !isEditing && onFileSelect(file.id)}
            className={cn(
              'w-full text-left h-[30px] text-[13px] transition-colors truncate flex items-center',
              activeFileId === file.id
                ? 'bg-theme-active text-foreground'
                : 'text-foreground/60 hover:bg-theme-hover hover:text-foreground/80'
            )}
            style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
          >
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={finishRename}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-background border border-border rounded px-1 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            ) : (
              file.name
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            onClick={() => startRename(file.id, file.name, 'file')}
            className="gap-2"
          >
            <Pencil className="w-4 h-4" />
            Rename
          </ContextMenuItem>
          {renderMoveToSubmenu(file.id, file.parentId, 'file')}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onDeleteFile(file.id)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const rootFolders = getFoldersInFolder(null);
  const rootFiles = getFilesInFolder(null);

  return (
    <div className="flex-1 overflow-y-auto py-0.5">
      {rootFolders.map(f => renderFolder(f))}
      {rootFiles.map(f => renderFile(f))}
    </div>
  );
}
