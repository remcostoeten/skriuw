import { cn } from "@/lib/utils";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { FileItem } from "./file-item";

type props = {
    name: string;
    path: string;
    files: File[];
    level?: number;
    activeFile?: string;
    onFileClick?: (file: File) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export const FolderItem = ({
    name,
    path,
    files,
    level = 0,
    activeFile,
    onFileClick,
    isOpen = false,
    onToggle,
}: props) => {

    return (
        <div className="w-full">
            <button
                onClick={onToggle}
                className={cn(
                    "h-7 w-full rounded-md px-3 text-xs font-medium",
                    "flex items-center justify-between gap-2",
                    "fill-muted-foreground hover:fill-foreground",
                    "text-secondary-foreground/80 hover:text-foreground",
                    "hover:bg-accent transition-all active:scale-[0.98]"
                )}
                style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isOpen ? (
                        <FolderOpen className="w-[18px] h-[18px] shrink-0" />
                    ) : (
                        <Folder className="w-[18px] h-[18px] shrink-0" />
                    )}
                    <span className="truncate">{name}</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-foreground/40">{files.length}</span>
                    <ChevronRight
                        className={cn(
                            "w-4 h-4 transition-transform",
                            isOpen && "rotate-90"
                        )}
                    />
                </div>
            </button>

            {isOpen && (
                <div className="flex flex-col gap-1 mt-1">
                    {files.map((file) => (
                        <FileItem
                            key={file.id}
                            name={file.name}
                            path={file.path}
                            level={level + 1}
                            isActive={activeFile === file.path}
                            onClick={() => onFileClick?.(file)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
