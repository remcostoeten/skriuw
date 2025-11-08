import { IconButton } from "@/shared/components/icon-button";
import { TopSectionWrapper } from "@/shared/components/top-section-wrapper";
import {
    Maximize2,
    Minimize2,
    Search,
    Type,
    X,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "utils";

type ActionButton = {
    icon: ReactNode;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
};

type SearchConfig = {
    query: string;
    setQuery: (value: string) => void;
    close: () => void;
    toggle?: () => void;
    updateOptions: (option: 'caseSensitive' | 'wholeWord') => void;
    isOpen?: boolean;
};

type InputConfig = {
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
    close: () => void;
    toggle?: () => void;
    onSubmit?: () => void;
    showCloseButton?: boolean;
    buttonIcon?: ReactNode;
    buttonTooltip?: string;
};

type props = {
    buttons: ActionButton[];
    searchConfig?: SearchConfig;
    inputConfig?: InputConfig;
    expandConfig?: {
        isExpanded: boolean;
        onToggle: () => void;
    };
}

export function BaseActionBar({
    buttons,
    searchConfig,
    inputConfig,
    expandConfig,
}: props) {
    const [isInputVisible, setIsInputVisible] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Use searchState.isOpen if provided, otherwise fall back to local state
    const [localSearchVisible, setLocalSearchVisible] = useState(false);
    const isSearchVisible = searchConfig?.isOpen !== undefined
        ? searchConfig.isOpen
        : localSearchVisible;

    useEffect(() => {
        if (isSearchVisible && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchVisible]);

    useEffect(() => {
        if (isInputVisible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isInputVisible]);

    const searchToggle = searchConfig?.toggle;
    const searchClose = searchConfig?.close;
    const inputToggle = inputConfig?.toggle;
    const inputClose = inputConfig?.close;

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
        }
    }, [searchClose]);

    const handleInputToggle = useCallback(() => {
        if (inputToggle) {
            inputToggle();
        }
        setIsInputVisible((prev) => !prev);
    }, [inputToggle]);

    const handleInputClose = useCallback(() => {
        if (inputClose) {
            inputClose();
        }
        setIsInputVisible(false);
        setIsInputFocused(false);
    }, [inputClose]);

    const handleInputFocus = useCallback(() => {
        setIsInputFocused(true);
    }, []);

    const expandIsExpanded = expandConfig?.isExpanded;
    const expandOnToggle = expandConfig?.onToggle;
    const hasSearchConfig = !!searchConfig;
    const hasInputConfig = !!inputConfig;

    const minimizeIcon = useMemo(() => <Minimize2 />, []);
    const maximizeIcon = useMemo(() => <Maximize2 />, []);
    const searchIcon = useMemo(() => <Search />, []);

    const allButtons = useMemo(() => {
        const result = [...buttons];

        if (expandConfig && expandOnToggle) {
            result.push({
                icon: expandIsExpanded ? minimizeIcon : maximizeIcon,
                tooltip: expandIsExpanded ? "Collapse All" : "Expand All",
                onClick: expandOnToggle,
            });
        }

        if (hasSearchConfig && handleSearchToggle) {
            result.push({
                icon: searchIcon,
                tooltip: "Search",
                onClick: handleSearchToggle,
            });
        }

        if (hasInputConfig && handleInputToggle && inputConfig.buttonIcon && inputConfig.buttonTooltip) {
            result.push({
                icon: inputConfig.buttonIcon,
                tooltip: inputConfig.buttonTooltip,
                onClick: handleInputToggle,
            });
        }

        return result;
    }, [buttons, expandIsExpanded, expandOnToggle, hasSearchConfig, hasInputConfig, handleSearchToggle, handleInputToggle, inputConfig, minimizeIcon, maximizeIcon, searchIcon]);

    const isAnyInputVisible = isSearchVisible || isInputVisible;

    return (
        <div className="relative top-0 flex flex-col min-h-8 w-full border-b bg-background overflow-hidden">
            <TopSectionWrapper isInputVisible={isAnyInputVisible}>
                {allButtons.map((button, index) => (
                    <IconButton
                        key={`action-button-${button.tooltip}-${index}`}
                        icon={button.icon}
                        tooltip={button.tooltip}
                        onClick={button.onClick}
                        disabled={button.disabled}
                    />
                ))}
            </TopSectionWrapper>      

            {searchConfig && (
                <div
                    className={cn(
                        "absolute pb-[0.5px] flex flex-row items-center justify-center",
                        "w-full h-full px-[5px] gap-1 shrink-0",
                        "transform transition-all",
                        isSearchVisible ? "translate-y-0" : "translate-y-12"
                    )}
                >
                    <div className="rounded-md w-full flex items-center justify-start bg-background pl-2 pr-1 gap-0.5 border focus-within:ring-1 focus-within:ring-border/60 transition-all">
                        <input
                            ref={searchInputRef}
                            id="notesSearch"
                            className="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px]"
                            type="text"
                            placeholder="Search"
                            autoComplete="off"
                            autoCorrect="off"
                            value={searchConfig.query}
                            onChange={(e) => searchConfig.setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    handleSearchClose();
                                }
                            }}
                            onBlur={handleSearchClose}
                        />
                        <IconButton
                            icon={<Type />}
                            tooltip="Match Case"
                            variant="ghost"
                            onClick={() => searchConfig.updateOptions('caseSensitive')}
                        />
                        <IconButton
                            icon={
                                <svg
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
                            onClick={() => searchConfig.updateOptions('wholeWord')}
                        />
                        <IconButton
                            icon={<X />}
                            tooltip="Close"
                            variant="ghost"
                            onClick={handleSearchClose}
                        />
                    </div>
                </div>
            )}

            {inputConfig && (
                <div
                    className={cn(
                        "absolute pb-[0.5px] flex flex-row items-center justify-center",
                        "w-full h-full px-[5px] gap-1 shrink-0",
                        "transform transition-all",
                        isInputVisible ? "translate-y-0" : "translate-y-12"
                    )}
                >
                    <div className="rounded-md w-full flex items-center justify-start bg-background pl-2 pr-1 gap-0.5 border focus-within:ring-1 focus-within:ring-border/60 transition-all">
                        <input
                            ref={inputRef}
                            className="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px]"
                            type="text"
                            placeholder={inputConfig.placeholder}
                            autoComplete="off"
                            autoCorrect="off"
                            value={inputConfig.value}
                            onChange={(e) => inputConfig.setValue(e.target.value)}
                            onFocus={handleInputFocus}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && inputConfig.onSubmit) {
                                    inputConfig.onSubmit();
                                } else if (e.key === "Escape") {
                                    handleInputClose();
                                }
                            }}
                            onBlur={() => setIsInputFocused(false)}
                        />
                        {isInputFocused && inputConfig.onSubmit && (
                            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border rounded text-muted-foreground">
                                ↵
                            </kbd>
                        )}
                        {inputConfig.showCloseButton !== false && (
                            <IconButton
                                icon={<X />}
                                tooltip="Close"
                                variant="ghost"
                                onClick={handleInputClose}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

