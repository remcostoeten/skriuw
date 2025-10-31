import { FolderPlus, Maximize2, Plus, Search } from 'lucide-react';

type props = {
    onNewNote?: () => void;
    onNewFolder?: () => void;
    onToggleAllFolders?: () => void;
    onSearchToggle?: () => void;
    isSearchOpen: boolean;
};

export function Toolbar({
    onNewNote,
    onNewFolder,
    onToggleAllFolders,
    onSearchToggle,
    isSearchOpen
}: props) {
    return (
        <div
            className={`flex flex-row py-4 w-full justify-center h-full px-3.5 gap-2 shrink-0 transition-all duration-300 ${isSearchOpen ? '-translate-y-12' : 'translate-y-0'}`}
        >
            <button
                onClick={onNewNote}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground active:scale-95 h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
                aria-label="New note"
            >
                <Plus className="w-[18px] h-[18px] text-muted-foreground" />
            </button>

            <button
                onClick={onNewFolder}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground active:scale-95 h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
                aria-label="New folder"
            >
                <FolderPlus className="w-[18px] h-[18px] text-muted-foreground" />
            </button>

            <button
                onClick={onToggleAllFolders}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground active:scale-95 h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
                aria-label="Toggle fullscreen"
            >
                <Maximize2 className="w-[18px] h-[18px] text-muted-foreground" />
            </button>

            <button
                onClick={onSearchToggle}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground active:scale-95 h-7 w-7 fill-muted-foreground hover:fill-foreground transition-all"
                aria-label="Toggle search"
            >
                <Search className="w-[18px] h-[18px] text-muted-foreground" />
            </button>
        </div>
    );
}
