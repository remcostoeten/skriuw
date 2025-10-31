import { transact, tx } from '@/api/db/client';
import type { Folder, Note } from "@/api/db/schema";
import { ActionBar } from "@/components/file-tree/action-bar";
import { cn } from "@/lib/utils";
import { useUpdateFolder } from "@/modules/folders/api/mutations/update";
import { useGetFolders } from "@/modules/folders/api/queries/get-folders";
import { useUpdateNote } from "@/modules/notes/api/mutations/update";
import { useGetNotes } from "@/modules/notes/api/queries/get-notes";
import { useSidebarSearch } from "@/modules/search/hooks/use-sidebar-search";
import { useCallback, useEffect, useState } from "react";
import { FileItem } from "./file-item";
import { FolderItem } from "./folder-item";

export const Sidebar = () => {
    const { folders = [] } = useGetFolders();
    const { notes = [] } = useGetNotes();
    const { folders: searchFolders, notes: searchNotes, searchState } = useSidebarSearch();
    const { updateFolder } = useUpdateFolder();
    const { updateNote } = useUpdateNote();

    const [isExpanded, setIsExpanded] = useState(false);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

    // Drag and drop state
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);

    // Auto-cleanup drag state when no active drag operations
    useEffect(() => {
        if (!draggedFolderId && !draggedNoteId) {
            setDragOverFolderId(null);
            setDropPosition(null);
        }
    }, [draggedFolderId, draggedNoteId]);

    // Use search results if there's a query, otherwise use all data
    const displayFolders = searchState.query ? searchFolders : folders.filter((f: Folder) => !f.deletedAt);
    const displayNotes = searchState.query ? searchNotes : notes.filter((n: Note) => !n.folder);

    // Count children (notes + sub-folders) for each folder
    const getChildrenCount = (folderId: string) => {
        const childNotes = notes.filter((note: Note) => (note.folder as any)?.id === folderId);
        const childFolders = folders.filter((folder: Folder) => (folder.parent as any)?.id === folderId && !folder.deletedAt);
        return childNotes.length + childFolders.length;
    };

    // Get notes for a specific folder
    const getFolderNotes = (folderId: string) => {
        return notes.filter((note: Note) => (note.folder as any)?.id === folderId);
    };

    // Get sub-folders for a specific folder
    const getSubFolders = (folderId: string) => {
        return folders.filter((folder: Folder) => (folder.parent as any)?.id === folderId && !folder.deletedAt);
    };

    const handleExpandToggle = () => {
        if (isExpanded) {
            // Collapse all folders
            setOpenFolders(new Set());
        } else {
            // Expand all folders
            setOpenFolders(new Set(displayFolders.map((f: any) => f.item?.id || f.id)));
        }
        setIsExpanded(!isExpanded);
    };

    const toggleFolder = (folderId: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    };

    const handleFolderRename = async (id: string, newName: string) => {
        try {
            await updateFolder(id, { name: newName });
        } catch (error) {
            console.error("Failed to rename folder:", error);
        }
    };

    const handleNoteClick = (noteId: string) => {
        setActiveFile(noteId);
        // Here you could add additional navigation logic if needed
    };

    // Drag and drop handlers
    const handleDragStart = (type: 'folder' | 'note', id: string) => {
        if (type === 'folder') {
            setDraggedFolderId(id);
        } else {
            setDraggedNoteId(id);
        }
        setDragOverFolderId(null);
        setDropPosition(null);
    };

    const handleDragEnd = () => {
        // Reset all drag-related state immediately
        setDraggedFolderId(null);
        setDraggedNoteId(null);
        setDragOverFolderId(null);
        setDropPosition(null);
    };

    const handleDragOver = (folderId: string, position: 'before' | 'after' | 'inside') => {
        if (draggedFolderId === folderId) return; // Can't drop on itself
        setDragOverFolderId(folderId);
        setDropPosition(position);
    };

    const handleDragLeave = () => {
        setDragOverFolderId(null);
        setDropPosition(null);
    };

    const handleDrop = async (targetFolderId: string, position: 'before' | 'after' | 'inside') => {
        try {
            // Handle folder drop
            if (draggedFolderId) {
                const draggedFolder = folders.find((f: Folder) => f.id === draggedFolderId);
                if (!draggedFolder) return;

                let newParentId: string | null = null;
                let newPosition: number;

                if (position === 'inside') {
                    newParentId = targetFolderId;
                    // Calculate position inside target folder
                    const childFolders = folders.filter((f: Folder) =>
                        (f.parent as any)?.id === targetFolderId && f.id !== draggedFolderId
                    );
                    newPosition = childFolders.length > 0
                        ? Math.max(...childFolders.map((f: Folder) => f.position || 0)) + 1
                        : 0;
                } else {
                    // Calculate position for before/after
                    const targetFolder = folders.find((f: Folder) => f.id === targetFolderId);
                    if (!targetFolder) return;

                    const parentId = (targetFolder.parent as any)?.id || null;
                    const siblings = folders.filter((f: Folder) =>
                        ((f.parent as any)?.id || null) === parentId && f.id !== draggedFolderId
                    );
                    const targetIndex = siblings.findIndex((f: Folder) => f.id === targetFolderId);

                    if (position === 'before') {
                        const prevPosition = targetIndex > 0
                            ? siblings[targetIndex - 1].position || 0
                            : 0;
                        newPosition = (prevPosition + (targetFolder.position || 0)) / 2;
                    } else { // after
                        const nextPosition = targetIndex < siblings.length - 1
                            ? siblings[targetIndex + 1].position || 0
                            : (targetFolder.position || 0) + 100;
                        newPosition = ((targetFolder.position || 0) + nextPosition) / 2;
                    }
                    newParentId = parentId;
                }

                const currentParentId = (draggedFolder.parent as any)?.id || null;
                await updateFolder(draggedFolderId, {
                    parentId: newParentId,
                    position: newPosition
                }, currentParentId);
            }

            // Handle note drop
            else if (draggedNoteId) {
                const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);
                if (!draggedNote) return;

                if (position === 'inside') {
                    // Move note into folder
                    const childNotes = notes.filter((n: Note) =>
                        (n.folder as any)?.id === targetFolderId && n.id !== draggedNoteId
                    );
                    const newPosition = childNotes.length > 0
                        ? Math.max(...childNotes.map((n: Note) => n.position || 0)) + 1
                        : 0;

                    // Update note's folder and position
                    await transact([
                        tx.notes[draggedNoteId].update({
                            position: newPosition,
                            updatedAt: Date.now()
                        }),
                        // Link to new folder
                        tx.notes[draggedNoteId].link({ folder: targetFolderId })
                    ]);
                } else {
                    // Reorder notes at root level (before/after folder - treat as root level positioning)
                    const rootNotes = notes.filter((n: Note) => !(n.folder as any) && n.id !== draggedNoteId);
                    const newPosition = rootNotes.length > 0
                        ? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1
                        : 0;

                    await transact([
                        tx.notes[draggedNoteId].update({
                            position: newPosition,
                            updatedAt: Date.now()
                        }),
                        // Unlink from any folder
                        ...(draggedNote.folder ? [tx.notes[draggedNoteId].unlink({ folder: (draggedNote.folder as any).id })] : [])
                    ]);
                }
            }
        } catch (error) {
            console.error('Failed to move item:', error);
        }

        // Reset drag state
        handleDragEnd();
    };

    return (
        <div
            className={cn(
                "fixed left-[220px] flex flex-col justify-start items-center bg-background overflow-y-auto",
                "transform transition-all duration-300 border-r"
            )}
            style={{
                width: "210px",
                height: "calc(100vh - 4.5rem)",
            }}
        >
            {/* Resize handle */}
            <div
                className={cn(
                    "h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10",
                    "hover:bg-foreground/10 hover:delay-75 transition-all duration-200",
                    "active:bg-foreground/20 active:!cursor-col-resize"
                )}
                role="presentation"
            />

            <ActionBar isExpanded={isExpanded} onExpandToggle={handleExpandToggle} />

            {/* File list */}
            <div className="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4">
                {displayFolders.map((folderData: any) => {
                    const folder = folderData.item || folderData;
                    const folderFiles = getFolderNotes(folder.id);

                    return (
                        <FolderItem
                            key={folder.id}
                            id={folder.id}
                            name={folder.name}
                            path={folder.path || `/${folder.name}`}
                            files={folderFiles}
                            activeFile={activeFile || undefined}
                            onFileClick={(note) => handleNoteClick(note.id)}
                            onFolderRename={handleFolderRename}
                            isOpen={openFolders.has(folder.id)}
                            onToggle={() => toggleFolder(folder.id)}
                            // Drag and drop props
                            isDragged={draggedFolderId === folder.id}
                            isDragOver={dragOverFolderId === folder.id}
                            dropPosition={dragOverFolderId === folder.id ? dropPosition : null}
                            onDragStart={() => handleDragStart('folder', folder.id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(position) => handleDragOver(folder.id, position)}
                            onDragLeave={handleDragLeave}
                            onDrop={(position) => handleDrop(folder.id, position)}
                        />
                    );
                })}

                {displayNotes.map((noteData: any) => {
                    const note = noteData.item || noteData;
                    return (
                        <FileItem
                            key={note.id}
                            id={note.id}
                            name={note.title}
                            path={note.path || `/${note.title}`}
                            isActive={activeFile === note.id}
                            onClick={handleNoteClick}
                            // Drag and drop props
                            isDragged={draggedNoteId === note.id}
                            onDragStart={() => handleDragStart('note', note.id)}
                            onDragEnd={handleDragEnd}
                        />
                    );
                })}
            </div>
        </div>
    );
};

