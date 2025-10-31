import type { Folder, Note } from "@/api/db/schema";
import { ActionBar } from "@/components/file-tree/action-bar";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { FileItem } from "./file-item";
import { FolderItem } from "./folder-item";
import { useGetFolders } from "@/modules/folders/api/queries/get-folders";
import { useGetNotes } from "@/modules/notes/api/queries/get-notes";
import { useSidebarSearch } from "@/modules/search/hooks/use-sidebar-search";
import { useUpdateFolder } from "@/modules/folders/api/mutations/update";

export const Sidebar = () => {
    const { folders = [] } = useGetFolders();
    const { notes = [] } = useGetNotes();
    const { folders: searchFolders, notes: searchNotes, searchState } = useSidebarSearch();
    const { updateFolder } = useUpdateFolder();

    const [isExpanded, setIsExpanded] = useState(false);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

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
                        />
                    );
                })}
            </div>
        </div>
    );
};

