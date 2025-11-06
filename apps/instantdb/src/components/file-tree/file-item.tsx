import type { Folder as TFolder } from "@/api/db/schema";
import { useUserSetting } from "@/hooks/use-user-setting";
import { ChevronRight, Copy, Edit2, Eye, Folder, FolderOpen, Pin, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "utils";
import { ItemContextMenu, type MenuItem, type SubMenuItem } from "./item-context-menu";
import { getDragClasses, getDragStyles, hapticDragStart, hapticDrop, addDraggingClass, removeDraggingClass } from "./drag-animations";

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
    onNoteDelete?: (id: string) => void;
    onNoteDuplicate?: (id: string) => Promise<void>;
    onNoteMove?: (noteId: string, folderId: string | null) => void;
    onNotePin?: (noteId: string, pinned: boolean) => Promise<void>;
    pinned?: boolean;
    folders?: TFolder[];
    isFocused?: boolean;
    onFocus?: () => void;
}

export function FileItem({
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
    onNoteDelete,
    onNoteDuplicate,
    onNoteMove,
    onNotePin,
    pinned = false,
    folders = [],
    isFocused = false,
    onFocus,
}: props) {
    const [dragOverState, setDragOverState] = useState<'before' | 'after' | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(name);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const noteRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get setting for allowing delete without context menu
    const [allowDeleteWithoutContextMenu] = useUserSetting<boolean>('allowDeleteWithoutContextMenu', false);

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

    // Clear drag over state when drag ends (draggedNoteId becomes null)
    useEffect(() => {
        if (!draggedNoteId) {
            setDragOverState(null);
        }
    }, [draggedNoteId]);

    // Handle keyboard shortcuts when context menu is open
    useEffect(() => {
        if (!isContextMenuOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.shiftKey && (e.key === 'R' || e.key === 'r') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                setIsContextMenuOpen(false);
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        setIsEditing(true);
                        setEditName(name);
                        setTimeout(() => {
                            if (inputRef.current) {
                                inputRef.current.focus();
                                inputRef.current.select();
                            }
                        }, 50);
                    }, 100);
                });
                return;
            }

            // Check for Shift+D (Duplicate) - check both uppercase and lowercase
            if (e.shiftKey && (e.key === 'D' || e.key === 'd') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                setIsContextMenuOpen(false);
                setTimeout(async () => {
                    await onNoteDuplicate?.(id);
                }, 100);
                return;
            }

            // Check for Shift+P (Pin/Unpin) - check both uppercase and lowercase
            if (e.shiftKey && (e.key === 'P' || e.key === 'p') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                setIsContextMenuOpen(false);
                setTimeout(async () => {
                    await onNotePin?.(id, !pinned);
                }, 100);
                return;
            }

            // Check for Shift+Backspace (Delete)
            if (e.shiftKey && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                setIsContextMenuOpen(false);
                setTimeout(() => {
                    onNoteDelete?.(id);
                }, 100);
                return;
            }
        };

        // Use capture phase to catch events before context menu handles them
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isContextMenuOpen, name, id, onNoteDuplicate, onNoteDelete, onNotePin, pinned]);

    // Handle delete shortcut when context menu is closed (if setting enabled)
    useEffect(() => {
        if (!allowDeleteWithoutContextMenu || isContextMenuOpen || isEditing) return;
        if (!(isFocused || isActive)) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Shift+Backspace (Delete)
            if (e.shiftKey && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                onNoteDelete?.(id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [allowDeleteWithoutContextMenu, isContextMenuOpen, isEditing, isFocused, isActive, id, onNoteDelete]);

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
        addDraggingClass();
        onDragStart?.();
    };

    const handleDragEnd = () => {
        setDragOverState(null);
        removeDraggingClass();
        if (noteRef.current && noteRef.current === document.activeElement) {
            noteRef.current.blur();
        }
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

    const handleRename = () => {
        setIsContextMenuOpen(false);
        // Use setTimeout to ensure context menu closes before focusing input
        setTimeout(() => {
            setIsEditing(true);
            setEditName(name);
            // Focus the input after it's rendered
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            }, 10);
        }, 0);
    };

    const handleViewNote = () => {
        onClick?.(id);
    };

    const handleDuplicate = async () => {
        setIsContextMenuOpen(false);
        setTimeout(async () => {
            await onNoteDuplicate?.(id);
        }, 0);
    };

    const handleDelete = () => {
        setIsContextMenuOpen(false);
        setTimeout(() => {
            onNoteDelete?.(id);
        }, 0);
    };

    const handleMoveToFolder = (folderId: string | null) => {
        onNoteMove?.(id, folderId);
    };

    // Build folder hierarchy for "Move to" submenu - recursively shows nested folders
    const buildFolderTree = (parentId: string | null = null, excludeId?: string): SubMenuItem[] => {
        const childFolders = folders.filter((f: TFolder) => {
            const folderParentId = (f.parent as any)?.id || null;
            return folderParentId === parentId && f.id !== excludeId && !f.deletedAt;
        });

        if (childFolders.length === 0) {
            return [];
        }

        return childFolders.map((folder: TFolder) => {
            const subFolders = buildFolderTree(folder.id, excludeId);
            return {
                id: folder.id,
                label: folder.name,
                icon: FolderOpen,
                onSelect: () => handleMoveToFolder(folder.id),
                // Only include subItems if there are nested folders
                ...(subFolders.length > 0 ? { subItems: subFolders } : {}),
            };
        });
    };

    const contextMenuItems: MenuItem[] = [
        {
            id: "view",
            label: "View note",
            icon: Eye,
            onSelect: handleViewNote,
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
            id: "rename",
            label: "Rename",
            icon: Edit2,
            shortcut: "⇧R",
            onSelect: handleRename,
        },
        {
            id: "duplicate",
            label: "Duplicate",
            icon: Copy,
            shortcut: "⇧D",
            onSelect: handleDuplicate,
        },
        {
            id: "pin",
            label: pinned ? "Unpin" : "Pin",
            icon: Pin,
            shortcut: "⇧P",
            onSelect: async () => {
                setIsContextMenuOpen(false);
                setTimeout(async () => {
                    await onNotePin?.(id, !pinned);
                }, 0);
            },
        },
        {
            id: "separator-2",
            label: "",
            separator: true,
        },
        {
            id: "visibility",
            label: "Visibility",
            icon: ChevronRight,
            disabled: true,
            tooltip: "Not implemented yet",
            subItems: [],
        },
        {
            id: "share",
            label: "Share",
            disabled: true,
            tooltip: "Not implemented yet",
        },
        {
            id: "separator-3",
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

    return (
        <div className="relative w-full">
            {draggedNoteId && dragOverState === 'before' && (
                <div
                    className="absolute top-0 left-0 right-0 h-px z-10"
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
                        (isActive || isContextMenuOpen) && !isEditing
                            ? "bg-accent text-foreground"
                            : "text-secondary-foreground/80 hover:bg-accent",
                        pinned && "bg-accent/50",
                        dragOverState && "bg-accent/20",
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
                    {pinned && (
                        <Pin className="h-3 w-3 text-primary shrink-0" />
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
            </ItemContextMenu>
            {draggedNoteId && dragOverState === 'after' && (
                <div
                    className="absolute bottom-0 left-0 right-0 h-px z-10"
                    style={{
                        background: 'linear-gradient(to right, transparent, hsl(var(--primary)), transparent)',
                    }}
                />
            )}
        </div>
    );
}
