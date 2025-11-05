import type { Folder as FolderType, Note } from "@/api/db/schema";
import { cn } from "utils";
import { Folder, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FileItem } from "./file-item";
import { getDragClasses, getDragStyles, hapticDragStart, hapticDrop } from "./drag-animations";

type props = {
    name: string;
    path: string;
    id: string;
    files: Note[];
    subFolders?: FolderType[];
    childrenCount?: number;
    level?: number;
    activeFile?: string;
    onFileClick?: (note: Note) => void;
    onFolderRename?: (id: string, newName: string) => void;
    isOpen?: boolean;
    onToggle?: () => void;
    openFolders?: Set<string>;
    onToggleFolder?: (folderId: string) => void;
    getFolderNotes?: (folderId: string) => Note[];
    getSubFolders?: (folderId: string) => FolderType[];
    getChildrenCount?: (folderId: string) => number;
    folders?: FolderType[];
    notes?: Note[];
    onDragStartFolder?: (type: 'folder' | 'note', id: string) => void;
    onDragOverFolder?: (folderId: string, position: 'before' | 'after' | 'inside') => void;
    onDropFolder?: (targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
    isDragOverFolderId?: string | null;
    draggedFolderId?: string | null;
    draggedNoteId?: string | null;
    dropPositionGlobal?: 'before' | 'after' | 'inside' | null;
    onDragLeaveFolder?: () => void;
    // Drag and drop props
    isDragged?: boolean;
    isDragOver?: boolean;
    dropPosition?: 'before' | 'after' | 'inside' | null;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onDragOver?: (position: 'before' | 'after' | 'inside') => void;
    onDragLeave?: () => void;
    onDrop?: (position: 'before' | 'after' | 'inside') => void;
    onNoteReorder?: (draggedNoteId: string, targetNoteId: string, position: 'before' | 'after') => void;
    onNoteRename?: (id: string, newName: string) => void;
    isFocused?: boolean;
    onFocus?: () => void;
    isItemFocused?: (type: 'folder' | 'note', id: string) => boolean;
    handleItemFocus?: (type: 'folder' | 'note', id: string) => void;
}

export const FolderItem = ({
    name,
    path,
    id,
    files,
    subFolders = [],
    childrenCount,
    level = 0,
    activeFile,
    onFileClick,
    onFolderRename,
    isOpen = false,
    onToggle,
    openFolders,
    onToggleFolder,
    getFolderNotes,
    getSubFolders,
    getChildrenCount,
    folders,
    notes,
    onDragStartFolder,
    onDragOverFolder,
    onDropFolder,
    isDragOverFolderId,
    draggedFolderId,
    draggedNoteId,
    dropPositionGlobal,
    onDragLeaveFolder,
    isDragged = false,
    isDragOver = false,
    dropPosition = null,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onNoteReorder,
    onNoteRename,
    isFocused = false,
    onFocus,
    isItemFocused,
    handleItemFocus,
}: props) => {
    const totalCount = childrenCount ?? (files.length + subFolders.length);
    const hasChildren = totalCount > 0;
    const folderRef = useRef<HTMLDivElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(name);
    const inputRef = useRef<HTMLInputElement>(null);
    const expandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const canDrop = () => {
        if (draggedFolderId && draggedFolderId === id) return false;
        if (draggedFolderId && folders) {
            const isDescendant = (childId: string, ancestorId: string): boolean => {
                if (childId === ancestorId) return true;
                const child = folders.find((f: FolderType) => f.id === childId);
                if (!child || !child.parent) return false;
                const parentId = (child.parent as any)?.id;
                if (parentId === ancestorId) return true;
                return isDescendant(parentId, ancestorId);
            };
            return !isDescendant(id, draggedFolderId);
        }
        return true;
    };

    // Drag event handlers
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
        if (expandTimeoutRef.current) {
            clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
        }
        onDragEnd?.();
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (draggedFolderId && !canDrop()) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const rect = folderRef.current?.getBoundingClientRect();
        if (!rect) return;

        const y = e.clientY - rect.top;
        const height = rect.height;
        
        let position: 'before' | 'after' | 'inside';

        // When dragging a NOTE onto a folder, strongly favor "inside" placement
        // Only use before/after if explicitly hovering on the very edge
        // When dragging a FOLDER, use larger edge zones for easier sibling placement
        if (draggedNoteId) {
            // For notes: use tiny edge zones (3px or 10% of height, whichever is smaller)
            const noteThreshold = Math.min(3, height * 0.1);
            if (y < noteThreshold) {
                position = 'before';
            } else if (y > height - noteThreshold) {
                position = 'after';
            } else {
                position = 'inside';
            }
        } else {
            // For folders: use 25% edge zones for easier sibling placement
            const folderThreshold = height * 0.25;
            if (y < folderThreshold) {
                position = 'before';
            } else if (y > height - folderThreshold) {
                position = 'after';
            } else {
                position = 'inside';
            }
        }

        // Auto-expand closed folders when hovering to drop inside
        if (position === 'inside' && !isOpen && onToggle) {
            if (expandTimeoutRef.current) {
                clearTimeout(expandTimeoutRef.current);
            }
            expandTimeoutRef.current = setTimeout(() => {
                onToggle();
            }, 500);
        }

        onDragOver?.(position);
        onDragOverFolder?.(id, position);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        if (expandTimeoutRef.current) {
            clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
        }

        const rect = folderRef.current?.getBoundingClientRect();
        if (rect) {
            const x = e.clientX;
            const y = e.clientY;
            const margin = 10;
            if (x < rect.left - margin || x > rect.right + margin ||
                y < rect.top - margin || y > rect.bottom + margin) {
                onDragLeave?.();
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        if (expandTimeoutRef.current) {
            clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
        }

        if (draggedFolderId && !canDrop()) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        hapticDrop();
        const position = dropPosition || 'inside';
        onDrop?.(position);
        onDragLeave?.();
    };

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

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(true);
        setEditName(name);
    };

    const handleRenameSubmit = () => {
        if (editName.trim() && editName !== name) {
            onFolderRename?.(id, editName.trim());
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

    return (
        <div className="w-full relative">
            <div
                ref={folderRef}
                draggable={!isEditing}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "h-7 w-full rounded-md px-3 text-xs font-medium",
                    "flex items-center justify-between gap-2",
                    "fill-muted-foreground hover:fill-foreground",
                    "text-secondary-foreground/80 hover:text-foreground",
                    hasChildren && !isEditing && "hover:bg-accent",
                    isEditing && "select-none focus:outline-none",
                    getDragClasses({ isDragged, isEditing, isFocused })
                )}
                style={getDragStyles({ level })}
                onClick={!isEditing && !isDragged && hasChildren ? onToggle : undefined}
                onDoubleClick={handleDoubleClick}
                onFocus={onFocus}
                tabIndex={isFocused ? 0 : -1}
                role="treeitem"
                aria-expanded={isOpen}
                aria-selected={isFocused}
                aria-level={level + 1}
                aria-label={`Folder ${name}, ${hasChildren ? `${totalCount} items` : 'empty'}`}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isOpen ? (
                        <FolderOpen className="w-[18px] h-[18px] shrink-0" />
                    ) : (
                        <Folder className="w-[18px] h-[18px] shrink-0" />
                    )}
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
                <div className="flex items-center gap-1">
                    {hasChildren && (
                        <span className="text-foreground/40">{totalCount}</span>
                    )}
                </div>
            </div>

            {isOpen && (
                <div
                    className={cn(
                        "flex flex-col gap-1 mt-1"
                    )}
                    onDragOver={(e) => {
                        if (!draggedNoteId && !draggedFolderId) return;
                        if (draggedFolderId && !canDrop()) return;

                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';

                        // Only set drag over if not already set, or if dragging over empty space
                        if (isDragOverFolderId !== id || dropPositionGlobal !== 'inside') {
                            onDragOverFolder?.(id, 'inside');
                        }
                    }}
                    onDragLeave={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX;
                        const y = e.clientY;
                        const margin = 10;

                        // Only clear if truly leaving the area
                        if (x < rect.left - margin || x > rect.right + margin ||
                            y < rect.top - margin || y > rect.bottom + margin) {
                            if (isDragOverFolderId === id && dropPositionGlobal === 'inside') {
                                onDragLeaveFolder?.();
                            }
                        }
                    }}
                    onDrop={(e) => {
                        if (!draggedNoteId && !draggedFolderId) return;
                        if (draggedFolderId && !canDrop()) return;

                        e.preventDefault();
                        e.stopPropagation();

                        if (isDragOverFolderId === id && dropPositionGlobal === 'inside') {
                            onDropFolder?.(id, 'inside');
                        }
                    }}
                >
                    {subFolders && subFolders.length > 0 && getSubFolders && getFolderNotes && getChildrenCount && openFolders && onToggleFolder && onDragStartFolder && onDragOverFolder && onDropFolder && onDragLeaveFolder && (
                        subFolders.map((subFolder) => {
                            const subFolderNotes = getFolderNotes(subFolder.id);
                            const subFolderSubFolders = getSubFolders(subFolder.id);
                            const subFolderChildrenCount = getChildrenCount(subFolder.id);
                            return (
                                <FolderItem
                                    key={subFolder.id}
                                    id={subFolder.id}
                                    name={subFolder.name}
                                    path={`/${subFolder.name}`}
                                    files={subFolderNotes}
                                    subFolders={subFolderSubFolders}
                                    childrenCount={subFolderChildrenCount}
                                    level={level + 1}
                                    activeFile={activeFile}
                                    onFileClick={onFileClick}
                                    onFolderRename={onFolderRename}
                                    isOpen={openFolders.has(subFolder.id)}
                                    onToggle={() => onToggleFolder(subFolder.id)}
                                    openFolders={openFolders}
                                    onToggleFolder={onToggleFolder}
                                    getFolderNotes={getFolderNotes}
                                    getSubFolders={getSubFolders}
                                    getChildrenCount={getChildrenCount}
                                    folders={folders}
                                    notes={notes}
                                    onDragStartFolder={onDragStartFolder}
                                    onDragOverFolder={onDragOverFolder}
                                    onDropFolder={onDropFolder}
                                    isDragOverFolderId={isDragOverFolderId}
                                    draggedFolderId={draggedFolderId}
                                    draggedNoteId={draggedNoteId}
                                    dropPositionGlobal={dropPositionGlobal}
                                    onDragLeaveFolder={onDragLeaveFolder}
                                    isDragged={draggedFolderId === subFolder.id}
                                    isDragOver={isDragOverFolderId === subFolder.id}
                                    dropPosition={isDragOverFolderId === subFolder.id ? dropPositionGlobal : null}
                                    onDragStart={() => onDragStartFolder('folder', subFolder.id)}
                                    onDragEnd={onDragEnd}
                                    onDragOver={(position) => onDragOverFolder(subFolder.id, position)}
                                    onDragLeave={onDragLeaveFolder}
                                    onDrop={(position) => onDropFolder(subFolder.id, position)}
                                    onNoteReorder={onNoteReorder}
                                    onNoteRename={onNoteRename}
                                    isFocused={isItemFocused?.('folder', subFolder.id) || false}
                                    onFocus={() => handleItemFocus?.('folder', subFolder.id)}
                                    isItemFocused={isItemFocused}
                                    handleItemFocus={handleItemFocus}
                                />
                            );
                        })
                    )}
                    {files.map((file) => (
                        <FileItem
                            key={file.id}
                            id={file.id}
                            name={file.title}
                            path={`/${file.title}`}
                            level={level + 1}
                            isActive={activeFile === file.id}
                            onClick={() => onFileClick?.(file)}
                            isDragged={draggedNoteId === file.id}
                            draggedNoteId={draggedNoteId}
                            draggedFolderId={draggedFolderId}
                            onDragStart={() => onDragStartFolder?.('note', file.id)}
                            onDragEnd={onDragEnd}
                            onNoteReorder={onNoteReorder}
                            onNoteRename={onNoteRename}
                            isFocused={isItemFocused?.('note', file.id) || false}
                            onFocus={() => handleItemFocus?.('note', file.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
