import { Plus, FolderPlus, Search, X, Minimize2, Maximize2, Download } from "lucide-react";
import {
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { IconButton } from "@/shared/ui/icons";

import { cn } from "@/shared/utilities";

type ActionButton = {
    icon: ReactNode;
    tooltip: string;
    className?: string;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
};

type SearchConfig = {
    query: string;
    setQuery: (value: string) => void;
    close: () => void;
    toggle?: () => void;
    isOpen?: boolean;
};

type ExpandConfig = {
    isExpanded: boolean;
    onToggle: () => void;
};

type props = {
    onCreateNote: () => void;
    onCreateFolder: () => void;
    onImportSeeds?: () => void;
    searchConfig?: SearchConfig;
    expandConfig?: ExpandConfig;
};


function TopSectionWrapper({
    isInputVisible,
    children,
}: {
    isInputVisible: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-2 px-3.5 transition-all",
                isInputVisible && "opacity-0 pointer-events-none"
            )}
        >
            {children}
        </div>
    );
}

export function ActionBar({ onCreateNote, onCreateFolder, onImportSeeds, searchConfig, expandConfig }: props) {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const [localSearchVisible, setLocalSearchVisible] = useState(false);
    const isSearchOpen = searchConfig?.isOpen !== undefined
        ? searchConfig.isOpen
        : localSearchVisible;

    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchOpen]);

    const searchToggle = searchConfig?.toggle;
    const searchClose = searchConfig?.close;

    const handleSearchToggle = useCallback(() => {
        if (searchToggle) {
            searchToggle();
        } else {
            setLocalSearchVisible((prev) => !prev);
        }
    }, [searchToggle]);

    const handleSearchClose = useCallback(() => {
        if (searchClose) {
            searchClose();
        } else {
            setLocalSearchVisible(false);
            if (searchConfig) {
                searchConfig.setQuery("");
            }
        }
    }, [searchClose, searchConfig]);

    const handleSearchBlur = useCallback(
        (event: React.FocusEvent<HTMLDivElement>) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (
                searchContainerRef.current &&
                (!nextTarget || !searchContainerRef.current.contains(nextTarget))
            ) {
                handleSearchClose();
            }
        },
        [handleSearchClose],
    );

    const searchIcon = useMemo(() => <Search className="w-[18px] h-[18px] text-muted-foreground" />, []);
    const plusIcon = useMemo(() => <Plus className="w-[18px] h-[18px] text-muted-foreground" />, []);
    const folderPlusIcon = useMemo(() => <FolderPlus className="w-[18px] h-[18px] text-muted-foreground" />, []);
    const downloadIcon = useMemo(() => <Download className="w-[18px] h-[18px] text-muted-foreground" />, []);
    const xIcon = useMemo(() => <X className="w-[18px] h-[18px] text-muted-foreground" />, []);
    const minimizeIcon = useMemo(() => <Minimize2 className="w-[18px] h-[18px] text-muted-foreground" />, []);
    const maximizeIcon = useMemo(() => <Maximize2 className="w-[18px] h-[18px] text-muted-foreground" />, []);

    const allButtons: ActionButton[] = useMemo(() => {
        const result: ActionButton[] = [
            {
                icon: plusIcon,
                tooltip: "Create new note",
                onClick: onCreateNote,
            },
            {
                icon: folderPlusIcon,
                tooltip: "Create new folder",
                onClick: onCreateFolder,
            },
        ];

        if (onImportSeeds) {
            result.push({
                icon: downloadIcon,
                tooltip: "Import seeds",
                onClick: onImportSeeds,
            });
        }

        if (expandConfig && expandConfig.onToggle) {
            result.push({
                icon: expandConfig.isExpanded ? minimizeIcon : maximizeIcon,
                tooltip: expandConfig.isExpanded ? "Collapse All" : "Expand All",
                onClick: expandConfig.onToggle,
            });
        }

        if (searchConfig && handleSearchToggle) {
            result.push({
                icon: searchIcon,
                tooltip: "Search",
                onClick: (event) => {
                    if (event.detail !== 0) {
                        handleSearchToggle();
                    }
                },
                onKeyDown: (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSearchToggle();
                    }
                },
                "aria-expanded": isSearchOpen,
                "aria-controls": "notesSearch",
            });
        }

        return result;
    }, [plusIcon, folderPlusIcon, searchIcon, minimizeIcon, maximizeIcon, onCreateNote, onCreateFolder, searchConfig, expandConfig, handleSearchToggle, isSearchOpen]);

    return (
        <div className="relative top-0 flex flex-col items-center justify-center min-h-10 w-full border-b border-sidebar-border bg-sidebar-background overflow-hidden">
            <TopSectionWrapper isInputVisible={isSearchOpen}>
                {allButtons.map((button, index) => (
                    <IconButton
                        key={`action-button-${button.tooltip}-${index}`}
                        icon={button.icon}
                        tooltip={button.tooltip}
                        variant="action-bar"
                        className={button.className}
                        onClick={button.onClick}
                        disabled={button.disabled}
                        onKeyDown={button.onKeyDown}
                        aria-expanded={button["aria-expanded"]}
                        aria-controls={button["aria-controls"]}
                    />
                ))}
            </TopSectionWrapper>

            {searchConfig && (
                <div
                    ref={searchContainerRef}
                    className={cn(
                        "absolute pb-[0.5px] flex flex-row items-center justify-center",
                        "w-full h-full px-[5px] gap-1 shrink-0",
                        "transform transition-all duration-200",
                        isSearchOpen ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0 pointer-events-none"
                    )}
                    onBlur={handleSearchBlur}
                >
                    <div className="rounded-md w-full flex items-center justify-start bg-sidebar-background pl-2 pr-1 gap-0.5 border border-sidebar-border focus-within:ring-1 focus-within:ring-sidebar-ring transition-all">
                        <input
                            ref={searchInputRef}
                            id="notesSearch"
                            className="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-xs text-sidebar-foreground"
                            type="text"
                            placeholder="Search..."
                            aria-label="Search notes"
                            autoComplete="off"
                            autoCorrect="off"
                            value={searchConfig.query}
                            onChange={(e) => searchConfig.setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    handleSearchClose();
                                }
                            }}
                        />
                        <IconButton
                            icon={xIcon}
                            tooltip="Close"
                            variant="action-bar"
                            onClick={handleSearchClose}
                            className="w-6 h-6"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
