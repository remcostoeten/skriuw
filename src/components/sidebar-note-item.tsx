'use client';

import { useState, useRef } from 'react';
import type { Note, Folder } from '@/api/db/schema';
import { useUpdateNote } from '@/modules/notes/api/mutations/update';

type props = {
  note: Note;
  selectedNoteId?: string | null;
  draggedNoteId?: string | null;
  onNoteSelect?: (note: Note) => void;
  onDragStart?: (noteId: string) => void;
  onDragEnd?: () => void;
  onNoteDrop?: (
    draggedNoteId: string,
    targetNoteId: string,
    position: 'before' | 'after'
  ) => void;
};

const HOLD_DURATION = 500;

export function SidebarNoteItem({
  note,
  selectedNoteId,
  draggedNoteId,
  onNoteSelect,
  onDragStart,
  onDragEnd,
  onNoteDrop,
}: props) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(note.title || 'Untitled');
  const [dragOverState, setDragOverState] = useState<
    'before' | 'after' | null
  >(null);
  const [isHolding, setIsHolding] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { updateNote } = useUpdateNote();

  function handleMouseDown() {
    if (isEditing) return;

    holdTimeoutRef.current = setTimeout(() => {
      setIsHolding(true);
    }, HOLD_DURATION);
  }

  function handleMouseUp() {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    setIsHolding(false);
  }

  function handleMouseLeave() {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    setIsHolding(false);
  }

  function handleToggleNote() {
    if (isEditing || dragOverState) return;
    onNoteSelect?.(note);
  }

  async function commitRename() {
    if (name.trim() && name !== (note.title || 'Untitled')) {
      await updateNote(note.id, { title: name.trim() });
    }
    setIsEditing(false);
  }

  function handleDragStart(e: React.DragEvent) {
    if (isEditing || !isHolding) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', note.id);
    onDragStart?.(note.id);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!draggedNoteId || draggedNoteId === note.id) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const rect = noteRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const height = rect.height;
    const threshold = height / 3;

    const newState: 'before' | 'after' = y < threshold
      ? 'before'
      : 'after';

    if (newState !== dragOverState) {
      setDragOverState(newState);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    const rect = noteRef.current?.getBoundingClientRect();
    if (!rect) return;

    const margin = 5;
    const x = e.clientX;
    const y = e.clientY;

    const isOutside =
      x < rect.left - margin ||
      x > rect.right + margin ||
      y < rect.top - margin ||
      y > rect.bottom + margin;

    if (isOutside) {
      setDragOverState(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedNoteId || !dragOverState || draggedNoteId === note.id)
      return;

    onNoteDrop?.(draggedNoteId, note.id, dragOverState);

    setTimeout(() => {
      setDragOverState(null);
    }, 100);
  }

  function handleDragEnd() {
    setDragOverState(null);
    setIsHolding(false);
    onDragEnd?.();
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditing(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitRename();
    }
    if (e.key === 'Escape') {
      setName(note.title || 'Untitled');
      setIsEditing(false);
    }
  }

  function handleInputBlur() {
    commitRename();
  }

  function handleInputClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className="relative group mb-1">
      <div
        className={`
          absolute left-0 right-0 h-0.5 bg-gradient-to-r
          from-transparent via-primary to-transparent
          -translate-y-1 z-10
          ${
            dragOverState === 'before'
              ? 'opacity-100 scale-y-100'
              : 'opacity-0 scale-y-0'
          }
        `}
      />

      <div
        ref={noteRef}
        draggable={!isEditing && isHolding}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onClick={handleToggleNote}
        onDoubleClick={handleDoubleClick}
        className={`
          relative flex items-center justify-between px-8 py-2
          rounded-md transition-all duration-200
          ${isHolding ? 'cursor-grabbing' : 'cursor-pointer'}
          ${draggedNoteId === note.id ? 'opacity-50' : ''}
          ${selectedNoteId === note.id ? 'bg-accent/40' : ''}
          ${dragOverState ? 'bg-accent/20' : ''}
          ${
            !dragOverState && !isEditing && !isHolding
              ? 'hover:bg-accent/30 hover:translate-x-1'
              : ''
          }
        `}
      >
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              className="
                w-full bg-transparent outline-none text-sm
                border-b border-primary/50 focus:border-primary
                transition-colors
              "
              value={name}
              autoFocus
              onClick={handleInputClick}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
            />
          ) : (
            <span
              className="
                text-sm text-[#ccc] truncate select-none
                transition-colors duration-200
              "
            >
              {note.title || 'Untitled'}
            </span>
          )}
        </div>

        {draggedNoteId === note.id && (
          <div
            className="
              absolute -right-1 top-1/2 transform -translate-y-1/2
              w-1 h-6 bg-primary/60 rounded-full
            "
          />
        )}
      </div>

      <div
        className={`
          absolute left-0 right-0 h-0.5 bg-gradient-to-r
          from-transparent via-primary to-transparent
          translate-y-1 z-10
          ${
            dragOverState === 'after'
              ? 'opacity-100 scale-y-100'
              : 'opacity-0 scale-y-0'
          }
        `}
      />
    </div>
  );
}