'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  onReorderFiles?: (fileId: string, targetIndex: number, parentId: string | null) => void;
  onReorderFolders?: (folderId: string, targetIndex: number, parentId: string | null) => void;
}

type DragItem = {
  type: 'file' | 'folder';
  id: string;
  parentId: string | null;
};

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
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Drag and drop state
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; type: 'folder' | 'root' } | null>(null);

  // Focus and select text when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = useCallback((id: string, currentName: string, type: 'file' | 'folder') => {
    setEditingId(id);
    setEditingName(type === 'file' ? currentName.replace('.md', '') : currentName);
    setEditingType(type);
  }, []);

  const finishRename = useCallback(() => {
    if (editingId && editingName.trim()) {
      if (editingType === 'file') {
        onRenameFile(editingId, editingName.trim());
      } else {
        onRenameFolder(editingId, editingName.trim());
      }
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, editingType, onRenameFile, onRenameFolder]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  }, [finishRename]);

  // Double-click handler for inline rename
  const handleDoubleClick = useCallback((e: React.MouseEvent, id: string, name: string, type: 'file' | 'folder') => {
    e.preventDefault();
    e.stopPropagation();
    startRename(id, name, type);
  }, [startRename]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    setDragItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(item));
    // Add a slight delay to allow the drag image to render
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDragItem(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string | null, targetType: 'folder' | 'root') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragItem) return;
    
    // Prevent dropping a folder into itself or its descendants
    if (dragItem.type === 'folder' && targetType === 'folder') {
      const getDescendantIds = (folderId: string): string[] => {
        const children = folders.filter(f => f.parentId === folderId);
        return [folderId, ...children.flatMap(c => getDescendantIds(c.id))];
      };
      const descendants = getDescendantIds(dragItem.id);
      if (targetId && descendants.includes(targetId)) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
    }
    
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ id: targetId, type: targetType });
  }, [dragItem, folders]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're leaving to outside the list
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragItem) return;
    
    // Don't drop on itself
    if (dragItem.id === targetId) {
      setDragItem(null);
      setDropTarget(null);
      return;
    }
    
    // Prevent dropping folder into its descendants
    if (dragItem.type === 'folder' && targetId) {
      const getDescendantIds = (folderId: string): string[] => {
        const children = folders.filter(f => f.parentId === folderId);
        return [folderId, ...children.flatMap(c => getDescendantIds(c.id))];
      };
      if (getDescendantIds(dragItem.id).includes(targetId)) {
        setDragItem(null);
        setDropTarget(null);
        return;
      }
    }
    
    if (dragItem.type === 'file') {
      onMoveFile(dragItem.id, targetId);
    } else {
      onMoveFolder(dragItem.id, targetId);
    }
    
    setDragItem(null);
    setDropTarget(null);
  }, [dragItem, folders, onMoveFile, onMoveFolder]);

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
    const isDragging = dragItem?.id === folder.id;
    const isDropTarget = dropTarget?.id === folder.id;

    return (
      <div key={folder.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={() => !isEditing && onToggleFolder(folder.id)}
              onDoubleClick={(e) => handleDoubleClick(e, folder.id, folder.name, 'folder')}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, { type: 'folder', id: folder.id, parentId: folder.parentId })}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, folder.id, 'folder')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder.id)}
              className={cn(
                'w-full flex items-center gap-1.5 h-[30px] text-[13px] text-foreground/70 hover:bg-haptic-hover transition-colors group',
                isDragging && 'opacity-50',
                isDropTarget && 'bg-primary/20 ring-1 ring-primary/40'
              )}
              style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
            >
              <ChevronRight
                className={cn(
                  'w-3 h-3 shrink-0 transition-transform text-haptic-dim',
                  folder.isOpen && 'rotate-90'
                )}
                strokeWidth={1.5}
              />
              <Folder className="w-[15px] h-[15px] shrink-0 text-haptic-dim" strokeWidth={1.5} />
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent border-none text-[13px] outline-none caret-foreground selection:bg-primary/30 p-0 m-0"
                  style={{ caretColor: 'currentColor' }}
                />
              ) : (
                <span className="flex-1 text-left truncate select-none">{folder.name}</span>
              )}
              <span className="text-xs text-haptic-dim tabular-nums">{totalCount}</span>
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
    const isDragging = dragItem?.id === file.id;

    return (
      <ContextMenu key={file.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => !isEditing && onFileSelect(file.id)}
            onDoubleClick={(e) => handleDoubleClick(e, file.id, file.name, 'file')}
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, { type: 'file', id: file.id, parentId: file.parentId })}
            onDragEnd={handleDragEnd}
            className={cn(
              'w-full text-left h-[30px] text-[13px] transition-colors truncate flex items-center',
              activeFileId === file.id
                ? 'bg-haptic-active text-foreground'
                : 'text-foreground/60 hover:bg-haptic-hover hover:text-foreground/80',
              isDragging && 'opacity-50'
            )}
            style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={finishRename}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent border-none text-[13px] outline-none caret-foreground selection:bg-primary/30 p-0 m-0"
                style={{ caretColor: 'currentColor' }}
              />
            ) : (
              <span className="truncate select-none">{file.name}</span>
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
  const isRootDropTarget = dropTarget?.id === null && dropTarget?.type === 'root';

  return (
    <div 
      className={cn(
        "flex-1 overflow-y-auto py-0.5",
        isRootDropTarget && 'bg-primary/10'
      )}
      onDragOver={(e) => handleDragOver(e, null, 'root')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, null)}
    >
      {rootFolders.map(f => renderFolder(f))}
      {rootFiles.map(f => renderFile(f))}
    </div>
  );
}
