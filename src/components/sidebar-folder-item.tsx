'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Folder, Note } from '@/api/db/schema';
import { Folder as ClosedIcon, FolderOpen as OpenIcon } from 'lucide-react';
import { useUpdateFolder } from '@/modules/folders/api/mutations/update';
import { SidebarNoteItem } from './sidebar-note-item';

type TProps = {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
  draggedFolderId?: string | null;
  draggedNoteId?: string | null;
  onDragStart?: (folderId: string) => void;
  onDragEnd?: () => void;
  onDrop?: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
  onNoteDrop?: (draggedNoteId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
  onNoteSelect?: (note: Note) => void;
  selectedNoteId?: string | null;
  onNoteReorder?: (draggedNoteId: string, targetNoteId: string, position: 'before' | 'after') => void;
  onNoteDragStart?: (noteId: string) => void;
};

export function SidebarFolderItem({
  folder,
  folders,
  notes,
  draggedFolderId,
  draggedNoteId,
  onDragStart,
  onDragEnd,
  onDrop,
  onNoteDrop,
  onNoteSelect,
  selectedNoteId,
  onNoteReorder,
  onNoteDragStart,
}: TProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [dragOverState, setDragOverState] = useState<'before' | 'after' | 'inside' | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const folderRef = useRef<HTMLDivElement>(null);
  const dragStateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastDragStateRef = useRef<'before' | 'after' | 'inside' | null>(null);
  const { updateFolder } = useUpdateFolder();


  const childNotes = useMemo(() =>
    notes
      .filter((n) => (n.folder as any)?.id === folder.id)
      .sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0))
    , [notes, folder.id]);
  const childFolders = useMemo(() => folders.filter((f) => (f.parent as any)?.id === folder.id && !f.deletedAt), [folders, folder.id]);

  // Clean up drag state when parent drag ends
  useEffect(() => {
    if (!draggedFolderId && !draggedNoteId) {
      // Clear any pending timers
      if (dragStateTimerRef.current) {
        clearTimeout(dragStateTimerRef.current);
        dragStateTimerRef.current = null;
      }
      // Reset all drag-related state
      lastDragStateRef.current = null;
      setDragOverState(null);
      setIsDragActive(false);
    }
  }, [draggedFolderId, draggedNoteId]);

  // Prevent dragging folder into itself or its own children
  const canDrop = useMemo(() => {
    if (draggedFolderId && draggedFolderId === folder.id) return false;
    if (draggedFolderId) {
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
    }
    return true; // Notes can always be dropped on folders
  }, [draggedFolderId, draggedNoteId, folder.id, folders]);

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
    // Allow drop if we're dragging a folder (and it's a valid drop target) or a note
    const isDraggingValid = (draggedFolderId && canDrop) || draggedNoteId;
    if (!isDraggingValid) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    if (!isDragActive) {
      setIsDragActive(true);
    }

    const rect = folderRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const height = rect.height;

    // Use larger thresholds with hysteresis to prevent glitching
    const threshold = height * 0.25; // 25% instead of 33%
    const hysteresis = 8; // pixels of "sticky" zone

    // Determine drop position with hysteresis to prevent flickering
    let newState: 'before' | 'after' | 'inside';

    // Add hysteresis: if already in a state, make it slightly harder to leave
    const currentState = lastDragStateRef.current;

    if (y < threshold - (currentState === 'before' ? hysteresis : 0)) {
      newState = 'before';
    } else if (y > height - threshold + (currentState === 'after' ? hysteresis : 0)) {
      newState = 'after';
    } else {
      newState = 'inside';
      // Auto-open folder if it's closed and has children (debounced)
      if (!isOpen && (childNotes.length > 0 || childFolders.length > 0)) {
        setTimeout(() => {
          if (lastDragStateRef.current === 'inside') {
            setIsOpen(true);
          }
        }, 500);
      }
    }

    // Only update state if it's different and after a small debounce
    if (newState !== lastDragStateRef.current) {
      lastDragStateRef.current = newState;

      // Clear any pending timer
      if (dragStateTimerRef.current) {
        clearTimeout(dragStateTimerRef.current);
      }

      // Debounce state changes to prevent rapid flickering
      dragStateTimerRef.current = setTimeout(() => {
        setDragOverState(newState);
        dragStateTimerRef.current = null;
      }, 50); // 50ms debounce
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if we're leaving the folder area entirely
    const rect = folderRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX;
      const y = e.clientY;
      const margin = 10; // Larger margin to prevent flickering
      if (x < rect.left - margin || x > rect.right + margin || y < rect.top - margin || y > rect.bottom + margin) {
        // Clear timers
        if (dragStateTimerRef.current) {
          clearTimeout(dragStateTimerRef.current);
          dragStateTimerRef.current = null;
        }
        lastDragStateRef.current = null;
        setDragOverState(null);
        setIsDragActive(false);
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Clear any pending timers
    if (dragStateTimerRef.current) {
      clearTimeout(dragStateTimerRef.current);
      dragStateTimerRef.current = null;
    }

    // Reset drag state
    lastDragStateRef.current = null;
    setDragOverState(null);
    setIsDragActive(false);

    // Get the current drag state (before, after, or inside)
    const position = dragOverState || 'inside';

    // Handle folder drop
    if (draggedFolderId) {
      if (onDrop && canDrop) {
        onDrop(draggedFolderId, folder.id, position);
      }
    }
    // Handle note drop
    else if (draggedNoteId && onNoteDrop) {
      onNoteDrop(draggedNoteId, folder.id, position);
    }
    e.preventDefault();
    e.stopPropagation();

    if (!dragOverState || !canDrop) return;

    if (draggedFolderId) {
      onDrop?.(draggedFolderId, folder.id, dragOverState);
    } else if (draggedNoteId) {
      onNoteDrop?.(draggedNoteId, folder.id, dragOverState);
    }

    // Clear states with a small delay for smooth transition
    setTimeout(() => {
      setDragOverState(null);
      setIsDragActive(false);
    }, 100);
  }

  function handleDragEnd() {
    // Clear timers
    if (dragStateTimerRef.current) {
      clearTimeout(dragStateTimerRef.current);
      dragStateTimerRef.current = null;
    }
    lastDragStateRef.current = null;
    setDragOverState(null);
    setIsDragActive(false);
    onDragEnd?.();
  }

  return (
    <div className="relative group drag-container drop-zone-before drop-zone-after">
      {/* Drop indicator before folder - fixed position */}
      <div
        className={`
          drop-indicator absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent
          transform -translate-y-1 z-10
          ${dragOverState === 'before' ? 'opacity-100 scale-y-100 active' : 'opacity-0 scale-y-0'}
        `}
      />

      {/* Main folder item */}
      <div
        ref={folderRef}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={`
          relative flex items-center justify-between px-3 py-2 rounded-md
          drag-smooth cursor-grab
          ${draggedFolderId === folder.id ? 'dragging' : ''}
          ${!isDragActive && !isEditing ? 'hover:bg-accent/30 hover:translate-x-1' : ''}
          ${dragOverState === 'inside' ? 'drop-target-hover' : ''}
          ${dragOverState === 'before' || dragOverState === 'after' ? 'bg-accent/20' : ''}
        `}
        onClick={handleToggleFolder}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        {/* Drop zone indicator overlay */}
        {dragOverState === 'inside' && (
          <div className="absolute inset-0 border-2 border-primary/50 rounded-md border-dashed bg-primary/5 animate-pulse" />
        )}

        <div className="text-muted-foreground select-none transition-transform duration-200">
          {isOpen ? (
            <OpenIcon className={`h-4 w-4 ${isDragActive && dragOverState === 'inside' ? 'rotate-90' : ''}`} />
          ) : (
            <ClosedIcon className="h-4 w-4" />
          )}
        </div>

        <div className="flex-1 mx-2 min-w-0">
          {isEditing ? (
            <input
              className="w-full bg-transparent outline-none text-sm border-b border-primary/50 focus:border-primary transition-colors"
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
            <span className="text-sm text-[#ccc] truncate select-none transition-colors duration-200">
              {folder.name}
            </span>
          )}
        </div>

        {(draggedFolderId === folder.id || isDragActive) && (
          <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-1 h-6 bg-primary/60 rounded-full" />
        )}
      </div>

      <div
        className={`
          drop-indicator absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent
          translate-y-1 z-10
          ${dragOverState === 'after' ? 'opacity-100 scale-y-100 active' : 'opacity-0 scale-y-0'}
        `}
      />

      <div className={`
        folder-children
        ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="pl-4 pt-1">
          {childFolders.map((childFolder) => (
            <SidebarFolderItem
              key={childFolder.id}
              folder={childFolder}
              folders={folders}
              notes={notes}
              draggedFolderId={draggedFolderId}
              draggedNoteId={draggedNoteId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              onNoteDrop={onNoteDrop}
              onNoteSelect={onNoteSelect}
              selectedNoteId={selectedNoteId}
              onNoteReorder={onNoteReorder}
              onNoteDragStart={onNoteDragStart}
            />
          ))}

          {childNotes.map((note) => (
            <SidebarNoteItem
              key={note.id}
              note={note}
              selectedNoteId={selectedNoteId}
              draggedNoteId={draggedNoteId}
              onDragStart={onNoteDragStart}
              onDragEnd={onDragEnd}
              onNoteSelect={onNoteSelect}
              onNoteDrop={onNoteReorder}
            />
          ))}
        </div>
      </div>

      {isOpen && (
        <div
          className={`
            drop-indicator ml-6 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent
            ${dragOverState === 'inside' ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'}
          `}
        />
      )}
    </div>
  );
}


