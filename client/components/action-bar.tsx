import { Plus, FolderPlus, Search, X, Minimize2, Maximize2 } from "lucide-react";
import {
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ButtonHTMLAttributes,
} from "react";
import { cn } from "@/shared/utilities";

type IconButtonProps = {
    icon: ReactNode;
    tooltip: string;
    className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type ActionButton = IconButtonProps;

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
    searchConfig?: SearchConfig;
    expandConfig?: ExpandConfig;
};

function IconButton({
    icon,
    tooltip,
    onClick,
    disabled,
    className,
    ...buttonProps
}: IconButtonProps) {
    const { ["aria-label"]: ariaLabel, ...restButtonProps } = buttonProps;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
            title={tooltip}
            aria-label={ariaLabel ?? tooltip}
            {...restButtonProps}
        >
            {icon}
        </button>
    );
}

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

export function ActionBar({ onCreateNote, onCreateFolder, searchConfig, expandConfig }: props) {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    // Use searchState.isOpen if provided, otherwise fall back to local state
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

    const searchIcon = useMemo(() => <Search className="w-[18px] h-[18px] text-Skriuw-icon" />, []);
    const plusIcon = useMemo(() => <Plus className="w-[18px] h-[18px] text-Skriuw-icon" />, []);
    const folderPlusIcon = useMemo(() => <FolderPlus className="w-[18px] h-[18px] text-Skriuw-icon" />, []);
    const xIcon = useMemo(() => <X className="w-[18px] h-[18px] text-Skriuw-icon" />, []);
    const minimizeIcon = useMemo(() => <Minimize2 className="w-[18px] h-[18px] text-Skriuw-icon" />, []);
    const maximizeIcon = useMemo(() => <Maximize2 className="w-[18px] h-[18px] text-Skriuw-icon" />, []);

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
        <div className="relative top-0 flex flex-col items-center justify-center min-h-10 w-full border-b border-Skriuw-border bg-Skriuw-darker overflow-hidden">
            <TopSectionWrapper isInputVisible={isSearchOpen}>
                {allButtons.map((button, index) => (
                    <IconButton
                        key={`action-button-${button.tooltip}-${index}`}
                        {...button}
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
                    <div className="rounded-md w-full flex items-center justify-start bg-Skriuw-darker pl-2 pr-1 gap-0.5 border border-Skriuw-border focus-within:ring-1 focus-within:ring-Skriuw-border/60 transition-all">
                        <input
                            ref={searchInputRef}
                            id="notesSearch"
                            className="w-full bg-transparent outline-none placeholder:text-Skriuw-icon h-[30px] text-xs text-Skriuw-text"
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
                            onClick={handleSearchClose}
                            className="w-6 h-6"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
