'use client';

import type { Folder, Note } from '@/api/db/schema';
import { useSidebarSearch } from '@/modules/search/hooks/use-sidebar-search';
import { SidebarSearch } from './sidebar-search';
import { SidebarToolbar } from './sidebar-toolbar';

type TProps = {
    onNewNote?: () => void;
    onNewFolder?: () => void;
    onToggleFullscreen?: () => void;
    onFolderClick?: (folder: Folder) => void;
    onNoteClick?: (note: Note) => void;
    children?: React.ReactNode;
};

export function FoldersSidebar({
    onNewNote,
    onNewFolder,
    onToggleFullscreen,
    onFolderClick,
    onNoteClick,
    children,
}: TProps) {
    const { folders, notes, searchState, hasResults } = useSidebarSearch();

    return (
        <aside className="w-48 transition-all border-r duration-300 overflow-hidden bg-background/50 backdrop-blur-sm flex flex-col h-screen">
            <div className="relative flex flex-col min-h-10 w-full border-b bg-background overflow-hidden">
                <SidebarToolbar
                    isSearchOpen={searchState.isOpen}
                    onSearchToggle={searchState.toggle}
                    onNewNote={onNewNote}
                    onNewFolder={onNewFolder}
                    onToggleFullscreen={onToggleFullscreen}
                />

                <div
                    className={`absolute pb-[0.5px] flex flex-row items-center justify-center w-full h-full px-[5px] gap-1 shrink-0 transition-all duration-300 ${searchState.isOpen
                        ? 'pointer-events-auto translate-y-0 opacity-100'
                        : 'pointer-events-none translate-y-full opacity-0'
                        }`}
                >
                    <SidebarSearch
                        query={searchState.query}
                        onQueryChange={searchState.setQuery}
                        options={searchState.options}
                        onOptionsChange={searchState.updateOptions}
                        onClose={searchState.close}
                    />
                </div>
            </div>

            <div className="overflow-y-auto flex-1 px-2 py-2 scrollbar-thin">
                {searchState.query && (
                    <div className="mb-2 p-2 text-xs text-muted-foreground bg-muted/50 rounded border border-muted">
                        <p className="font-semibold mb-1">Searching: "{searchState.query}"</p>
                        <div className="flex gap-2 flex-wrap">
                            {searchState.options.caseSensitive && (
                                <span className="px-2 py-1 rounded bg-accent/20 text-accent-foreground text-xs">
                                    Case Sensitive
                                </span>
                            )}
                            {searchState.options.wholeWord && (
                                <span className="px-2 py-1 rounded bg-accent/20 text-accent-foreground text-xs">
                                    Whole Word
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {searchState.query ? (
                    <>
                        {folders.length > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-muted-foreground px-2 mb-1">
                                    Folders
                                </p>
                                {folders.map(({ item: folder, highlightedText }) => {
                                    const noteCount = notes.filter(
                                        (n) => (n.item as any).folder?.id === folder.id
                                    ).length;

                                    return (
                                        <button
                                            key={folder.id}
                                            onClick={() => onFolderClick?.(folder)}
                                            className="font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all flex items-center justify-between"
                                        >
                                            <div className="flex items-center w-[calc(100%-20px)] gap-2">
                                                <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" clipRule="evenodd" d="M7.59655 2.20712C7.10136 1.9989 6.56115 1.99943 5.9023 2.00007L4.40479 2.00015C3.57853 2.00013 2.88271 2.0001 2.32874 2.07318C1.74135 2.15066 1.20072 2.32242 0.764844 2.75008C0.328798 3.1779 0.153514 3.70882 0.0744639 4.28569C-4.74114e-05 4.82945 -2.52828e-05 5.51233 9.81743e-07 6.32281V11.8675C-1.65965e-05 13.1029 -3.08677e-05 14.1058 0.108284 14.8963C0.221156 15.72 0.464085 16.4241 1.03541 16.9846C1.60656 17.545 2.32369 17.7831 3.16265 17.8938C3.96804 18 4.99002 18 6.2493 18H13.7507C15.01 18 16.032 18 16.8374 17.8938C17.6763 17.7831 18.3934 17.545 18.9646 16.9846C19.5359 16.4241 19.7788 15.72 19.8917 14.8963C20 14.1058 20 13.1029 20 11.8676V9.94525C20 8.70992 20 7.70702 19.8917 6.91657C19.7788 6.09287 19.5359 5.38878 18.9646 4.82823C18.3934 4.26785 17.6763 4.02972 16.8374 3.91905C16.0319 3.81281 15.0099 3.81283 13.7506 3.81285L9.91202 3.81285C9.70527 3.81285 9.59336 3.81232 9.51046 3.80596C9.47861 3.80352 9.461 3.80081 9.45249 3.79919C9.44546 3.79427 9.43137 3.78367 9.40771 3.76281C9.34589 3.70835 9.26838 3.62926 9.12578 3.48235L8.91813 3.26831C8.46421 2.79975 8.09187 2.4154 7.59655 2.20712Z" />
                                                </svg>
                                                <span
                                                    className="text-xs truncate"
                                                    dangerouslySetInnerHTML={{ __html: highlightedText }}
                                                />
                                            </div>
                                            <span className="text-xs text-foreground/40">{noteCount}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {notes.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground px-2 mb-1">
                                    Notes
                                </p>
                                {notes.map(({ item: note, highlightedText }) => (
                                    <button
                                        key={note.id}
                                        className="font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all flex items-center gap-2"
                                        onClick={() => onNoteClick?.(note)}
                                    >
                                        <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                            <path fillRule="evenodd" clipRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 102 0V3h4v1a1 1 0 102 0V3a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" />
                                        </svg>
                                        <span
                                            className="text-xs truncate"
                                            dangerouslySetInnerHTML={{ __html: highlightedText }}
                                        />
                                    </button>
                                ))}
                            </div>
                        )}

                        {!hasResults && (
                            <div className="p-4 text-center text-muted-foreground">
                                <p className="text-sm">
                                    No results found for "{searchState.query}"
                                </p>
                            </div>
                        )}
                    </>
                ) : (
                    children || (
                        <div className="p-4 text-center text-muted-foreground">
                            <p className="text-sm">No notes or folders yet.</p>
                            <p className="text-xs mt-2">Click + to create one.</p>
                        </div>
                    )
                )}
            </div>
        </aside>
    );
}
