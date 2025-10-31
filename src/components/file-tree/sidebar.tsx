import type { Folder, Note } from "@/api/db/schema";
import { ActionBar } from "@/components/file-tree/action-bar";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { FileItem } from "./file-item";
import { FolderItem } from "./folder-item";

// Mock data
const mockFolders: Folder[] = [
    {
        id: "1",
        name: "Untitled",
        path: "/Haptic/Untitled",
        files: [
            {
                id: "1-1",
                name: "Getting Started.md",
                path: "/Haptic/Untitled/Getting Started.md",
            },
        ],
    },
    {
        id: "2",
        name: "Untitled 3",
        path: "/Haptic/Untitled 3",
        files: [],
    },
];

const mockFiles: Note[] = [
    {
        id: "f1",
        name: "Supported Devices.md",
        path: "/Haptic/Supported Devices.md",
    },
    {
        id: "f2",
        name: "Why Haptic.md",
        path: "/Haptic/Why Haptic.md",
    },
];

export const Sidebar = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeFile, setActiveFile] = useState("/Haptic/Supported Devices.md");
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

    const handleExpandToggle = () => {
        if (isExpanded) {
            // Collapse all folders
            setOpenFolders(new Set());
        } else {
            // Expand all folders
            setOpenFolders(new Set(mockFolders.map(f => f.id)));
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

    return (
        <div
            className={cn(
                "fixed left-12 flex flex-col justify-start items-center bg-background overflow-y-auto",
                "transform transition-all duration-300 border-r",
                className
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

            <ActionBar onNewFile={() => { }} onNewFolder={() => { }} onSearch={() => { }} $$ isExpanded={isExpanded} onExpandToggle={handleExpandToggle} />

            {/* File list */}
            <div className="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4">
                {mockFolders.map((folder) => (
                    <FolderItem
                        key={folder.id}
                        name={folder.name}
                        path={folder.path}
                        files={folder.files}
                        activeFile={activeFile}
                        onFileClick={(file) => setActiveFile(file.path)}
                        isOpen={openFolders.has(folder.id)}
                        onToggle={() => toggleFolder(folder.id)}
                    />
                ))}

                {mockFiles.map((file) => (
                    <FileItem
                        key={file.id}
                        name={file.name}
                        path={file.path}
                        isActive={activeFile === file.path}
                        onClick={() => setActiveFile(file.path)}
                    />
                ))}
            </div>
        </div>
    );
};

