import type { Note } from "@/api/db/schema";
import { cn } from "@/lib/utils";
import { ChevronRight, Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FileItem } from "./file-item";

type props = {
    name: string;
    path: string;
    id: string;
    files: Note[];
    level?: number;
    activeFile?: string;
    onFileClick?: (note: Note) => void;
    onFolderRename?: (id: string, newName: string) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export const FolderItem = ({
    name,
    path,
    id,
    files,
    level = 0,
    activeFile,
    onFileClick,
    onFolderRename,
    isOpen = false,
    onToggle,
}: props) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(name);
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
        <div className="w-full">
            <button
                onClick={!isEditing && files.length > 0 ? onToggle : undefined}
                onDoubleClick={handleDoubleClick}
                className={cn(
                    "h-7 w-full rounded-md px-3 text-xs font-medium",
                    "flex items-center justify-between gap-2",
                    "fill-muted-foreground hover:fill-foreground",
                    "text-secondary-foreground/80 hover:text-foreground",
                    files.length > 0 && !isEditing && "hover:bg-accent transition-all active:scale-[0.98]",
                    isEditing && "select-none focus:outline-none"
                )}
                style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Folder className="w-[18px] h-[18px] shrink-0" />
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
                    {files.length > 0 && (
                        <>
                            <span className="text-foreground/40">{files.length}</span>
                            <ChevronRight
                                className={cn(
                                    "w-4 h-4 transition-transform",
                                    isOpen && "rotate-90"
                                )}
                            />
                        </>
                    )}
                </div>
            </button>

            {isOpen && (
                <div className="flex flex-col gap-1 mt-1">
                    {files.map((file) => (
                        <FileItem
                            key={file.id}
                            id={file.id}
                            name={file.title}
                            path={`/${file.title}`}
                            level={level + 1}
                            isActive={activeFile === file.id}
                            onClick={() => onFileClick?.(file)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
