import { cn } from "utils";
import { useEffect, useRef, useState } from "react";
import { getDragClasses, getDragStyles, hapticDragStart, hapticDrop } from "./drag-animations";

type props = {
    id: string;
    name: string;
    path: string;
    level?: number;
    isActive?: boolean;
    onClick?: (id: string) => void;
    isDragged?: boolean;
    draggedNoteId?: string | null;
    draggedFolderId?: string | null;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onNoteReorder?: (draggedNoteId: string, targetNoteId: string, position: 'before' | 'after') => void;
    onNoteRename?: (id: string, newName: string) => void;
    isFocused?: boolean;
    onFocus?: () => void;
}

export const FileItem = ({
    id,
    name,
    path,
    level = 0,
    isActive = false,
    onClick,
    isDragged = false,
    draggedNoteId,
    draggedFolderId,
    onDragStart,
    onDragEnd,
    onNoteReorder,
    onNoteRename,
    isFocused = false,
    onFocus,
}: props) => {
    const [dragOverState, setDragOverState] = useState<'before' | 'after' | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(name);
    const noteRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            const timer = setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isEditing]);

    useEffect(() => {
        setEditName(name);
    }, [name]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(true);
        setEditName(name);
    };

    const handleRenameSubmit = () => {
        if (editName.trim() && editName !== name && onNoteRename) {
            onNoteRename(id, editName.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleRenameSubmit();
        } else if (e.key === "Escape") {
            setIsEditing(false);
            setEditName(name);
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        if (isEditing) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        hapticDragStart();
        onDragStart?.();
    };

    const handleDragEnd = () => {
        setDragOverState(null);
        onDragEnd?.();
    };

    const handleDragOver = (e: React.DragEvent) => {
        // If a folder is being dragged, let it bubble up to folder handlers
        if (draggedFolderId) return;
        
        // Only handle note reordering if we have the handler
        if (!draggedNoteId || draggedNoteId === id || !onNoteReorder) return;

        const rect = noteRef.current?.getBoundingClientRect();
        if (!rect) return;

        const y = e.clientY - rect.top;
        const height = rect.height;
        // Use smaller edge zones (20% top/bottom) to allow more space for folder drops
        const edgeThreshold = height * 0.2;

        // Only handle if we're in the edge zones (for reordering)
        // Otherwise, let the event bubble to parent folder for "inside" drops
        if (y < edgeThreshold) {
            // Top edge - show "before" indicator
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDragOverState('before');
        } else if (y > height - edgeThreshold) {
            // Bottom edge - show "after" indicator
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDragOverState('after');
        } else {
            // Middle area - clear our indicators and let it bubble to folder
            setDragOverState(null);
            e.preventDefault(); // Still prevent default to allow drop
            // Don't stopPropagation - let folder handle it
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // If a folder is being dragged, let it bubble
        if (draggedFolderId) return;
        
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
    };

    const handleDrop = (e: React.DragEvent) => {
        // If a folder is being dragged, let it bubble
        if (draggedFolderId) return;
        
        // Only handle note reordering if we have a drag over state (edge zone)
        // If no dragOverState, we were in the middle area, so let it bubble to folder
        if (!draggedNoteId || draggedNoteId === id || !onNoteReorder) return;
        
        if (dragOverState) {
            // We're in an edge zone, handle the reorder
            e.preventDefault();
            e.stopPropagation();
            hapticDrop();
            onNoteReorder(draggedNoteId, id, dragOverState);
            setDragOverState(null);
        } else {
            // We're in the middle area, let it bubble to the folder
            setDragOverState(null);
        }
    };

    return (
        <div className="relative w-full">
            <div
                ref={noteRef}
                draggable={!isEditing}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isEditing && onClick?.(id)}
                onDoubleClick={handleDoubleClick}
                onFocus={onFocus}
                className={cn(
                    "h-7 w-full rounded-md px-3 text-xs font-medium",
                    "flex items-center gap-2 justify-start",
                    "hover:text-foreground",
                    "outline-none border-none",
                    isActive && !isEditing
                        ? "bg-muted text-foreground"
                        : "text-secondary-foreground/80 hover:bg-muted/50",
                    isEditing && "select-none focus:outline-none",
                    getDragClasses({ isDragged, isEditing, isFocused, isActive })
                )}
                style={getDragStyles({ level })}
                tabIndex={isFocused ? 0 : -1}
                role="treeitem"
                aria-selected={isFocused || isActive}
                aria-level={level + 1}
                aria-label={`File ${name}`}
            >
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent outline-none border-none p-0 m-0 text-inherit font-inherit truncate min-w-0 select-text"
                        style={{ width: '100%', caretColor: 'hsl(var(--foreground))' }}
                    />
                ) : (
                    <span className="truncate">{name}</span>
                )}
            </div>
        </div>
    );
};
