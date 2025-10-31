import { IconButton } from "@/shared/components/icon-button";
import {
    FilePlus,
    FolderPlus,
    Maximize2,
    Minimize2,
    Search,
    Type,
    X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "utils";

type props = {
    isExpanded: boolean;
    onExpandToggle: () => void;
    onNewFile: () => void;
    onNewFolder: () => void;
    onSearch?: () => void;
}

export function ActionBar({
    isExpanded,
    onExpandToggle,
    onNewFile,
    onNewFolder,
    onSearch,
}: props) {
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <div className="relative top-0 flex flex-col min-h-10 w-full border-b bg-background overflow-hidden">
            <div
                className={cn(
                    "flex flex-row items-center justify-center w-full h-full px-3.5 gap-2 shrink-0",
                    "transform transition-all",
                    isSearchVisible ? "-translate-y-12" : "translate-y-0"
                )}
            >
                <IconButton
                    icon={<FilePlus className="w-[18px] h-[18px]" />}
                    tooltip="New File"
                    onClick={onNewFile}
                />
                <IconButton
                    icon={<FolderPlus className="w-[18px] h-[18px]" />}
                    tooltip="New Folder"
                    onClick={onNewFolder}
                />
                <IconButton
                    icon={
                        isExpanded ? (
                            <Minimize2 className="w-[18px] h-[18px]" />
                        ) : (
                            <Maximize2 className="w-[18px] h-[18px]" />
                        )
                    }
                    tooltip={isExpanded ? "Collapse All" : "Expand All"}
                    onClick={onExpandToggle}
                />
                <IconButton
                    icon={<Search className="w-[18px] h-[18px]" />}
                    tooltip="Search"
                    onClick={() => {
                        onSearch?.();
                        setIsSearchVisible(!isSearchVisible);
                    }}
                />
            </div>

            <div
                className={cn(
                    "absolute pb-[0.5px] flex flex-row items-center justify-center",
                    "w-full h-full px-[5px] gap-1 shrink-0",
                    "transform transition-all",
                    isSearchVisible ? "translate-y-0" : "translate-y-12"
                )}
            >
                <div className="rounded-md w-full flex items-center justify-start bg-background pl-2 pr-1 gap-0.5 border focus-within:ring-1 focus-within:ring-ring transition-all">
                    <input
                        id="notesSearch"
                        className="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px]"
                        type="text"
                        placeholder="Search"
                        autoComplete="off"
                        autoCorrect="off"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                setIsSearchVisible(false);
                                setSearchQuery("");
                            }
                        }}
                        onBlur={() => {
                            setIsSearchVisible(false);
                        }}
                        autoFocus={isSearchVisible}
                    />
                    <IconButton
                        icon={<Type className="w-[18px] h-[18px]" />}
                        tooltip="Match Case"
                        variant="ghost"
                    />
                    <IconButton
                        icon={
                            <svg
                                className="w-4 h-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <circle cx="7" cy="12" r="3" />
                                <path d="M10 9v6" />
                                <circle cx="17" cy="12" r="3" />
                                <path d="M14 7v8" />
                                <path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1" />
                            </svg>
                        }
                        tooltip="Match Whole Word"
                        variant="ghost"
                    />
                    <IconButton
                        icon={<X className="w-4 h-4" />}
                        tooltip="Close"
                        variant="ghost"
                        onClick={() => setIsSearchVisible(false)}
                    />
                </div>
            </div>
        </div>
    );
}
