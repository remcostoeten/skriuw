'use client';

import { useState, useMemo, useRef } from 'react';
import type { Folder, Note } from '@/lib/db/schema';
import { Folder as ClosedIcon, FolderOpen as OpenIcon } from 'lucide-react';
import { useUpdateFolder } from '@/modules/folders/api/mutations/update';

type TProps = {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
  draggedFolderId?: string | null;
  onDragStart?: (folderId: string) => void;
  onDragEnd?: () => void;
  onDrop?: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
};

export function SidebarFolderItem({ 
  folder, 
  folders, 
  notes,
  draggedFolderId,
  onDragStart,
  onDragEnd,
  onDrop,
}: TProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [dragOverState, setDragOverState] = useState<'before' | 'after' | 'inside' | null>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const { updateFolder } = useUpdateFolder();

  const childNotes = useMemo(() => notes.filter((n) => (n.folder as any)?.id === folder.id), [notes, folder.id]);
  const childFolders = useMemo(() => folders.filter((f) => (f.parent as any)?.id === folder.id && !f.deletedAt), [folders, folder.id]);

  // Prevent dragging folder into itself or its own children
  const canDrop = useMemo(() => {
    if (!draggedFolderId || draggedFolderId === folder.id) return false;
    // Check if target folder is a descendant of the dragged folder (prevent circular nesting)
    const isDescendant = (childId: string, ancestorId: string): boolean => {
      if (childId === ancestorId) return true;
      const child = folders.find((f) => f.id === childId);
      if (!child || !child.parent) return false;
      const parentId = (child.parent as any)?.id;
      if (parentId === ancestorId) return true;
      return isDescendant(parentId, ancestorId);
    };
    return !isDescendant(folder.id, draggedFolderId);
  }, [draggedFolderId, folder.id, folders]);

  function handleToggleFolder() {
    if (isEditing || dragOverState) return;
    const hasChildren = childNotes.length > 0 || childFolders.length > 0;
    if (hasChildren) setIsOpen(!isOpen);
  }

  async function commitRename() {
    if (name.trim() && name !== folder.name) {
      await updateFolder(folder.id, { name: name.trim() });
    }
    setIsEditing(false);
  }

  function handleDragStart(e: React.DragEvent) {
    if (isEditing) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', folder.id);
    onDragStart?.(folder.id);
    // Add slight delay to allow drag ghost to appear
    setTimeout(() => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
    }, 0);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!draggedFolderId || !canDrop) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const rect = folderRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const height = rect.height;
    const threshold = height / 3;

    // Determine drop position
    if (y < threshold) {
      setDragOverState('before');
    } else if (y > height - threshold && isOpen) {
      // Can drop inside if folder is open
      setDragOverState('inside');
    } else {
      setDragOverState('after');
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if we're leaving the folder area entirely
    const rect = folderRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setDragOverState(null);
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedFolderId || !canDrop || !dragOverState) return;

    onDrop?.(draggedFolderId, folder.id, dragOverState);
    setDragOverState(null);
  }

  function handleDragEnd() {
    setDragOverState(null);
    onDragEnd?.();
  }

  return (
    <div className="mb-1">
      {/* Drop indicator before folder */}
      {dragOverState === 'before' && (
        <div className="h-0.5 bg-primary mx-2 mb-1 rounded" />
      )}

      <div
        ref={folderRef}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={`
          group flex items-center justify-between px-2 py-1 rounded-md cursor-pointer
          transition-all duration-150
          ${draggedFolderId === folder.id ? 'opacity-50' : ''}
          ${dragOverState === 'inside' ? 'bg-primary/20 border-2 border-primary border-dashed' : 'hover:bg-accent/50'}
          ${dragOverState === 'after' ? 'ring-1 ring-primary' : ''}
        `}
        onClick={handleToggleFolder}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        <div className="flex items-center gap-2 flex-1 transition-all active:scale-[98%]">
          <div className="text-muted-foreground select-none">
            {isOpen ? <OpenIcon className="h-4 w-4" /> : <ClosedIcon className="h-4 w-4" />}
          </div>
          {isEditing ? (
            <input
              className="bg-transparent outline-none text-sm flex-1"
              value={name}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setName(folder.name);
                  setIsEditing(false);
                }
              }}
            />
          ) : (
            <span className="text-sm text-[#ccc] truncate select-none">{folder.name}</span>
          )}
        </div>
      </div>

      {/* Drop indicator after folder */}
      {dragOverState === 'after' && !isOpen && (
        <div className="h-0.5 bg-primary mx-2 mt-1 rounded" />
      )}

      {isOpen && (
        <div className="pl-4 mt-1">
          {childFolders.map((childFolder) => (
            <SidebarFolderItem 
              key={childFolder.id} 
              folder={childFolder} 
              folders={folders} 
              notes={notes}
              draggedFolderId={draggedFolderId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}

          {childNotes.map((note) => (
            <div key={note.id} className="px-2 py-1 text-sm text-muted-foreground truncate select-none">
              {note.title || 'Untitled'}
            </div>
          ))}
        </div>
      )}

      {/* Drop indicator inside (at bottom if folder is open) */}
      {dragOverState === 'inside' && isOpen && (
        <div className="h-0.5 bg-primary mx-2 mt-1 rounded ml-6" />
      )}
    </div>
  );
}


