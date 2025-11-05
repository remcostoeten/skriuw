import type { Folder as FolderType, Note } from "@/api/db/schema";
import { useUserSetting } from "@/hooks/use-user-setting";
import { Edit2, Folder, FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "utils";
import { FileItem } from "./file-item";
import { ItemContextMenu, type MenuItem, type SubMenuItem } from "./item-context-menu";

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
    getChildrenCount?: (foldetorId: string) => number;
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
    onNoteDelete?: (id: string) => void;
    onNoteDuplicate?: (id: string) => Promise<void>;
    onNoteMove?: (noteId: string, folderId: string | null) => void;
    onNotePin?: (noteId: string, pinned: boolean) => Promise<void>;
    onFolderDelete?: (id: string) => void;
    onFolderMove?: (folderId: string, targetFolderId: string | null) => void;
    isFocused?: boolean;
    onFocus?: () => void;
    isItemFocused?: (type: 'folder' | 'note', id: string) => boolean;
    handleItemFocus?: (type: 'folder' | 'note', id: string) => void;
}

export const FolderItem = ({
    name,
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
    onNoteDelete,
    onNoteDuplicate,
    onNoteMove,
    onNotePin,
    onFolderDelete,
    onFolderMove,
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
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const expandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Get setting for allowing delete without context menu
    const [allowDeleteWithoutContextMenu] = useUserSetting<boolean>('allowDeleteWithoutContextMenu', false);

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
        const threshold = height * 0.25;

        let position: 'before' | 'after' | 'inside';

        if (y < threshold) {
            position = 'before';
        } else if (y > height - threshold) {
            position = 'after';
        } else {
            position = 'inside';
            if (!isOpen && hasChildren && onToggle) {
                if (expandTimeoutRef.current) {
                    clearTimeout(expandTimeoutRef.current);
                }
                expandTimeoutRef.current = setTimeout(() => {
                    onToggle();
                }, 500);
            }
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

    const handleRename = () => {
        setIsContextMenuOpen(false);
        setTimeout(() => {
            setIsEditing(true);
            setEditName(name);
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            }, 10);
        }, 0);
    };

    const handleDelete = () => {
        setIsContextMenuOpen(false);
        setTimeout(() => {
            onFolderDelete?.(id);
        }, 0);
    };

    const handleMoveToFolder = (targetFolderId: string | null) => {
        setIsContextMenuOpen(false);
        setTimeout(() => {
            onFolderMove?.(id, targetFolderId);
        }, 0);
    };

    // Build folder hierarchy for "Move to" submenu - recursively shows nested folders
    const buildFolderTree = (parentId: string | null = null, excludeId?: string): SubMenuItem[] => {
        if (!folders) return [];

        const childFolders = folders.filter((f: FolderType) => {
            const folderParentId = (f.parent as any)?.id || null;
            return folderParentId === parentId && f.id !== excludeId && f.id !== id && !f.deletedAt;
        });

        if (childFolders.length === 0) {
            return [];
        }

        return childFolders.map((folder: FolderType) => {
            const subFolders = buildFolderTree(folder.id, excludeId);
            return {
                id: folder.id,
                label: folder.name,
                icon: FolderOpen,
                onSelect: () => handleMoveToFolder(folder.id),
                ...(subFolders.length > 0 ? { subItems: subFolders } : {}),
            };
        });
    };

    const contextMenuItems: MenuItem[] = [
        {
            id: "rename",
            label: "Rename",
            icon: Edit2,
            shortcut: "⇧R",
            onSelect: handleRename,
        },
        {
            id: "move-to",
            label: "Move to",
            icon: Folder,
            subItems: [
                {
                    id: "root",
                    label: "Root",
                    icon: FolderOpen,
                    onSelect: () => handleMoveToFolder(null),
                },
                ...(buildFolderTree(null) || []),
            ],
        },
        {
            id: "separator-1",
            label: "",
            separator: true,
        },
        {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            shortcut: "⇧⌫",
            variant: "destructive",
            onSelect: handleDelete,
        },
    ];

    // Handle keyboard shortcuts when context menu is open
    useEffect(() => {
        if (!isContextMenuOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Shift+R (Rename)
            if (e.shiftKey && e.key === 'R' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                handleRename();
                return;
            }

            // Check for Shift+Backspace (Delete)
            if (e.shiftKey && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isContextMenuOpen, name, id]);

    // Handle delete shortcut when context menu is closed (if setting enabled)
    useEffect(() => {
        if (!allowDeleteWithoutContextMenu || isContextMenuOpen || isEditing) return;
        if (!isFocused) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Shift+Backspace (Delete)
            if (e.shiftKey && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [allowDeleteWithoutContextMenu, isContextMenuOpen, isEditing, isFocused, handleDelete]);

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
            {/* Drop indicators */}
            {(draggedFolderId || draggedNoteId) && isDragOver && dropPosition === 'before' && (
                <div
                    className="absolute top-0 left-0 right-0 h-px z-10"
                    style={{
                        background: 'linear-gradient(to right, transparent, hsl(var(--primary)), transparent)',
                    }}
                />
            )}
            {(draggedFolderId || draggedNoteId) && isDragOver && dropPosition === 'after' && (
                <div
                    className="absolute bottom-0 left-0 right-0 h-px z-10"
                    style={{
                        background: 'linear-gradient(to right, transparent, hsl(var(--primary)), transparent)',
                    }}
                />
            )}

            <ItemContextMenu
                items={contextMenuItems}
                open={isContextMenuOpen}
                onOpenChange={setIsContextMenuOpen}
            >
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
                        hasChildren && !isEditing && "hover:bg-accent transition-all active:scale-[0.98]",
                        isEditing && "select-none focus:outline-none",
                        isDragged && "opacity-50 cursor-grabbing",
                        !isDragged && !isEditing && "cursor-grab active:cursor-grabbing",
                        isDragOver && dropPosition === 'inside' && "bg-accent/50 border border-primary/50"
                    )}
                    style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
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
                                className="flex-1 bg-transparent outline-none border-none p-0 m-0 text-inherit font-inherit truncate min-w-0 select-text cursor-text"
                                style={{ width: '100%', caretColor: 'hsl(var(--foreground))' }}
                            />
                        ) : (
                            <span className="truncate cursor-text">
                                {name}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {hasChildren && (
                            <span className="text-foreground/40">{totalCount}</span>
                        )}
                    </div>
                </div>
            </ItemContextMenu>

            {isOpen && (
                <div
                    className={cn(
                        "flex flex-col gap-1 mt-1",
                        (draggedNoteId || draggedFolderId) && isDragOverFolderId === id && dropPositionGlobal === 'inside' && "min-h-[20px] bg-accent/20 rounded-md"
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
                            onDragStart={() => onDragStartFolder?.('note', file.id)}
                            onDragEnd={onDragEnd}
                            onNoteReorder={onNoteReorder}
                            onNoteRename={onNoteRename}
                            onNoteDelete={onNoteDelete}
                            onNoteDuplicate={onNoteDuplicate}
                            onNoteMove={onNoteMove}
                            onNotePin={onNotePin}
                            pinned={file.pinned || false}
                            folders={folders}
                            isFocused={isItemFocused?.('note', file.id) || false}
                            onFocus={() => handleItemFocus?.('note', file.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
