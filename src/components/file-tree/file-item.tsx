import { cn } from "utils";
import { useEffect, useRef, useState } from "react";

interface FileItemProps {
    id: string;
    name: string;
    path: string;
    level?: number;
    isActive?: boolean;
    onClick?: (id: string) => void;
    isDragged?: boolean;
    draggedNoteId?: string | null;
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
    onDragStart,
    onDragEnd,
    onNoteReorder,
    onNoteRename,
    isFocused = false,
    onFocus,
}: FileItemProps) => {
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
        onDragStart?.();
    };

    const handleDragEnd = () => {
        setDragOverState(null);
        onDragEnd?.();
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!draggedNoteId || draggedNoteId === id || !onNoteReorder) return;

        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const rect = noteRef.current?.getBoundingClientRect();
        if (!rect) return;

        const y = e.clientY - rect.top;
        const height = rect.height;
        const threshold = height / 3;

        const newState: 'before' | 'after' = y < threshold ? 'before' : 'after';
        setDragOverState(newState);
    };

    const handleDragLeave = (e: React.DragEvent) => {
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
        e.preventDefault();
        e.stopPropagation();

        if (!draggedNoteId || !dragOverState || draggedNoteId === id || !onNoteReorder) return;

        onNoteReorder(draggedNoteId, id, dragOverState);
        setDragOverState(null);
    };

    return (
        <div className="relative w-full">
            {dragOverState === 'before' && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />
            )}
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
                    "transition-all hover:text-foreground active:scale-[0.98]",
                    "outline-none border-none",
                    isActive && !isEditing
                        ? "bg-muted text-foreground"
                        : "text-secondary-foreground/80 hover:bg-muted/50",
                    isDragged && "opacity-50 cursor-grabbing",
                    !isDragged && !isEditing && "cursor-grab active:cursor-grabbing",
                    dragOverState && "bg-accent/20",
                    isEditing && "select-none focus:outline-none",
                    isFocused && !isActive && "ring-1 ring-primary/50 ring-offset-1"
                )}
                style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
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
            {dragOverState === 'after' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10" />
            )}
        </div>
    );
};
