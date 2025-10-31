import { IconButton } from "@/shared/components/icon-button";
import {
    Maximize2,
    Minimize2,
    Search,
    Type,
    X,
} from "lucide-react";
import { ReactNode, useState } from "react";
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
};

type props = {
    buttons: ActionButton[];
    searchConfig?: SearchConfig;
    expandConfig?: {
        isExpanded: boolean;
        onToggle: () => void;
    };
}

export function BaseActionBar({
    buttons,
    searchConfig,
    expandConfig,
}: props) {
    const [isSearchVisible, setIsSearchVisible] = useState(false);

    const handleSearchToggle = () => {
        if (searchConfig) {
            if (searchConfig.toggle) {
                searchConfig.toggle();
            }
        }
        setIsSearchVisible(!isSearchVisible);
    };

    const handleSearchClose = () => {
        if (searchConfig) {
            searchConfig.close();
        }
        setIsSearchVisible(false);
    };

    const allButtons = [...buttons];

    if (expandConfig) {
        allButtons.push({
            icon: expandConfig.isExpanded ? (
                <Minimize2 className="w-[18px] h-[18px]" />
            ) : (
                <Maximize2 className="w-[18px] h-[18px]" />
            ),
            tooltip: expandConfig.isExpanded ? "Collapse All" : "Expand All",
            onClick: expandConfig.onToggle,
        });
    }

    if (searchConfig) {
        allButtons.push({
            icon: <Search className="w-[18px] h-[18px]" />,
            tooltip: "Search",
            onClick: handleSearchToggle,
        });
    }

    return (
        <div className="relative top-0 flex flex-col min-h-10 w-full border-b bg-background overflow-hidden">
            <div
                className={cn(
                    "flex flex-row items-center justify-center w-full h-full px-3.5 gap-2 shrink-0",
                    "transform transition-all",
                    isSearchVisible && searchConfig ? "-translate-y-12" : "translate-y-0"
                )}
            >
                {allButtons.map((button, index) => (
                    <IconButton
                        key={index}
                        icon={button.icon}
                        tooltip={button.tooltip}
                        onClick={button.onClick}
                        disabled={button.disabled}
                    />
                ))}
            </div>

            {searchConfig && (
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
                            value={searchConfig.query}
                            onChange={(e) => searchConfig.setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    handleSearchClose();
                                }
                            }}
                            onBlur={handleSearchClose}
                            autoFocus={isSearchVisible}
                        />
                        <IconButton
                            icon={<Type className="w-[18px] h-[18px]" />}
                            tooltip="Match Case"
                            variant="ghost"
                            onClick={() => searchConfig.updateOptions('caseSensitive')}
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
                            onClick={() => searchConfig.updateOptions('wholeWord')}
                        />
                        <IconButton
                            icon={<X className="w-4 h-4" />}
                            tooltip="Close"
                            variant="ghost"
                            onClick={handleSearchClose}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

