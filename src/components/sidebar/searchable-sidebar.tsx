'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Toolbar } from './toolbar';
import { SearchBar } from './search-bar';
import { useSearch } from '@/hooks/use-search';
import { highlightText, matchesSearch } from '@/lib/search-utils';
import type { Folder, Note } from '@/api/db/schema';
import { Button } from '@/shared/ui/button';
import { FolderPlus, Plus, Folder as ClosedIcon, FolderOpen as OpenIcon } from 'lucide-react';

type props = {
    folders: Folder[];
    onToggleAllFolders?: () => void;
    notes: Note[];
    isLoading?: boolean;
    onNewNote?: () => void;
    onNewFolder?: () => void;
    onFolderClick?: (folder: Folder) => void;
    onNoteClick?: (note: Note) => void;
    children?: React.ReactNode; // For custom folder items
    // Drag and drop props
    draggedFolderId?: string | null;
    draggedNoteId?: string | null;
    onDragStart?: (folderId: string) => void;
    onNoteDragStart?: (noteId: string) => void;
    onDragEnd?: () => void;
    onDrop?: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
    onNoteDrop?: (draggedNoteId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
    onNoteReorder?: (draggedNoteId: string, targetNoteId: string, position: 'before' | 'after') => void;
    onDropOnRoot?: (e: React.DragEvent) => void;
    onDragOverRoot?: (e: React.DragEvent) => void;
    onDragLeaveRoot?: (e: React.DragEvent) => void;
    dragOverRoot?: boolean;
    selectedNoteId?: string | null;
};

// Minimal folder item with drag and drop - preserving original styling
function FolderItem({
    folder,
    folders,
    notes,
    search,
    draggedFolderId,
    draggedNoteId,
    onDragStart,
    onDragEnd,
    onDrop,
    onNoteDrop,
    onFolderClick,
    onNoteClick,
    onNoteReorder,
    onNoteDragStart,
    selectedNoteId,
    onToggleAllFolders,
}: {
    folder: Folder;
    folders: Folder[];
    notes: Note[];
    search: ReturnType<typeof useSearch>;
    draggedFolderId?: string | null;
    draggedNoteId?: string | null;
    onDragStart?: (folderId: string) => void;
    onDragEnd?: () => void;
    onDrop?: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
    onNoteDrop?: (draggedNoteId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => void;
    onFolderClick?: (folder: Folder) => void;
    onNoteClick?: (note: Note) => void;
    onNoteReorder?: (draggedNoteId: string, targetNoteId: string, position: 'before' | 'after') => void;
    onNoteDragStart?: (noteId: string) => void;
    selectedNoteId?: string | null;
    onToggleAllFolders?: () => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [dragOverState, setDragOverState] = useState<'before' | 'after' | 'inside' | null>(null);
    const folderRef = useRef<HTMLDivElement>(null);

    const childNotes = useMemo(() =>
        notes
            .filter((n) => (n.folder as any)?.id === folder.id)
            .sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0)),
        [notes, folder.id]
    );

    const childFolders = useMemo(() =>
        folders.filter((f) => (f.parent as any)?.id === folder.id && !f.deletedAt),
        [folders, folder.id]
    );

    const hasChildren = childNotes.length > 0 || childFolders.length > 0;

    // Prevent dragging folder into itself
    const canDrop = useMemo(() => {
        if (draggedFolderId && draggedFolderId === folder.id) return false;
        if (draggedFolderId) {
            const isDescendant = (childId: string, ancestorId: string): boolean => {
                if (childId === ancestorId) return true;
                const child = folders.find((f) => f.id === childId);
                if (!child || !child.parent) return false;
                const parentId = (child.parent as any)?.id;
                if (parentId === ancestorId) return true;
                return isDescendant(parentId, ancestorId);
            };
            return !isDescendant(folder.id, draggedFolderId);
        }
        return true;
    }, [draggedFolderId, draggedNoteId, folder.id, folders]);

    useEffect(() => {
        if (!draggedFolderId && !draggedNoteId) {
            setDragOverState(null);
        }
    }, [draggedFolderId, draggedNoteId]);

    function handleToggleFolder() {
        if (hasChildren) setIsOpen(!isOpen);
    }

    function handleDragStart(e: React.DragEvent) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', folder.id);
        onDragStart?.(folder.id);
    }

    function handleDragOver(e: React.DragEvent) {
        const isDraggingValid = (draggedFolderId && canDrop) || draggedNoteId;
        if (!isDraggingValid) return;

        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const rect = folderRef.current?.getBoundingClientRect();
        if (!rect) return;

        const y = e.clientY - rect.top;
        const height = rect.height;
        const threshold = height * 0.3;

        let newState: 'before' | 'after' | 'inside';

        if (y < threshold) {
            newState = 'before';
        } else if (y > height - threshold) {
            newState = 'after';
        } else {
            newState = 'inside';
            // Auto-open folder if it's closed and has children
            if (!isOpen && hasChildren) {
                setTimeout(() => setIsOpen(true), 500);
            }
        }

        setDragOverState(newState);
    }

    function handleDragLeave(e: React.DragEvent) {
        const rect = folderRef.current?.getBoundingClientRect();
        if (rect) {
            const x = e.clientX;
            const y = e.clientY;
            const margin = 5;
            if (x < rect.left - margin || x > rect.right + margin || y < rect.top - margin || y > rect.bottom + margin) {
                setDragOverState(null);
            }
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();

        const position = dragOverState || 'inside';

        if (draggedFolderId) {
            if (onDrop && canDrop) {
                onDrop(draggedFolderId, folder.id, position);
            }
        } else if (draggedNoteId && onNoteDrop) {
            onNoteDrop(draggedNoteId, folder.id, position);
        }

        setDragOverState(null);
    }

    function handleDragEnd() {
        setDragOverState(null);
        onDragEnd?.();
    }

    const highlightedName = highlightText(folder.name, search.query, search.options);

    return (
        <div>
            {/* Drop indicator before folder */}
            {dragOverState === 'before' && (
                <div className="h-0.5 bg-primary opacity-100 mb-1" />
            )}

            <div
                ref={folderRef}
                draggable
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onClick={() => onFolderClick?.(folder)}
                className={`
                    font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                    hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground
                    hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all
                    flex items-center justify-between mb-1
                    ${draggedFolderId === folder.id ? 'opacity-50' : ''}
                    ${dragOverState === 'inside' ? 'bg-primary/10' : ''}
                    ${dragOverState === 'before' || dragOverState === 'after' ? 'bg-accent/20' : ''}
                `}
            >
                <div className="flex items-center w-[calc(100%-20px)] gap-2">
                    {hasChildren && (
                        <div className="text-muted-foreground select-none transition-transform duration-200">
                            {isOpen ? (
                                <OpenIcon className="h-4 w-4" />
                            ) : (
                                <ClosedIcon className="h-4 w-4" />
                            )}
                        </div>
                    )}

                    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M7.59655 2.20712C7.10136 1.9989 6.56115 1.99943 5.9023 2.00007L4.40479 2.00015C3.57853 2.00013 2.88271 2.0001 2.32874 2.07318C1.74135 2.15066 1.20072 2.32242 0.764844 2.75008C0.328798 3.1779 0.153514 3.70882 0.0744639 4.28569C-4.74114e-05 4.82945 -2.52828e-05 5.51233 9.81743e-07 6.32281V11.8675C-1.65965e-05 13.1029 -3.08677e-05 14.1058 0.108284 14.8963C0.221156 15.72 0.464085 16.4241 1.03541 16.9846C1.60656 17.545 2.32369 17.7831 3.16265 17.8938C3.96804 18 4.99002 18 6.2493 18H13.7507C15.01 18 16.032 18 16.8374 17.8938C17.6763 17.7831 18.3934 17.545 18.9646 16.9846C19.5359 16.4241 19.7788 15.72 19.8917 14.8963C20 14.1058 20 13.1029 20 11.8676V9.94525C20 8.70992 20 7.70702 19.8917 6.91657C19.7788 6.09287 19.5359 5.38878 18.9646 4.82823C18.3934 4.26785 17.6763 4.02972 16.8374 3.91905C16.0319 3.81281 15.0099 3.81283 13.7506 3.81285L9.91202 3.81285C9.70527 3.81285 9.59336 3.81232 9.51046 3.80596C9.47861 3.80352 9.461 3.80081 9.45249 3.79919C9.44546 3.79427 9.43137 3.78367 9.40771 3.76281C9.34589 3.70835 9.26838 3.62926 9.12578 3.48235L8.91813 3.26831C8.46421 2.79975 8.09187 2.4154 7.59655 2.20712Z" />
                    </svg>
                    <span
                        className="text-xs truncate"
                        dangerouslySetInnerHTML={{ __html: highlightedName }}
                    />
                </div>
                <span className="text-xs text-foreground/40">{childNotes.length}</span>
            </div>

            {/* Drop indicator after folder */}
            {dragOverState === 'after' && (
                <div className="h-0.5 bg-primary opacity-100 mb-1" />
            )}

            {/* Child items */}
            {isOpen && hasChildren && (
                <div className="pl-4 mb-1">
                    {childFolders.map((childFolder) => (
                        <FolderItem
                            key={childFolder.id}
                            folder={childFolder}
                            folders={folders}
                            notes={notes}
                            search={search}
                            draggedFolderId={draggedFolderId}
                            draggedNoteId={draggedNoteId}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onDrop={onDrop}
                            onNoteDrop={onNoteDrop}
                            onFolderClick={onFolderClick}
                            onNoteClick={onNoteClick}
                            onNoteReorder={onNoteReorder}
                            onNoteDragStart={onNoteDragStart}
                            selectedNoteId={selectedNoteId}
                            onToggleAllFolders={onToggleAllFolders}
                        />
                    ))}

                    {childNotes.map((note) => (
                        <NoteItem
                            key={note.id}
                            note={note}
                            search={search}
                            selectedNoteId={selectedNoteId}
                            draggedNoteId={draggedNoteId}
                            onNoteSelect={onNoteClick}
                            onDragStart={onNoteDragStart}
                            onDragEnd={onDragEnd}
                            onNoteDrop={onNoteReorder}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Minimal note item with drag and drop - preserving original styling
function NoteItem({
    note,
    search,
    selectedNoteId,
    draggedNoteId,
    onNoteSelect,
    onDragStart,
    onDragEnd,
    onNoteDrop,
}: {
    note: Note;
    search: ReturnType<typeof useSearch>;
    selectedNoteId?: string | null;
    draggedNoteId?: string | null;
    onNoteSelect?: (note: Note) => void;
    onDragStart?: (noteId: string) => void;
    onDragEnd?: () => void;
    onNoteDrop?: (
        draggedNoteId: string,
        targetNoteId: string,
        position: 'before' | 'after'
    ) => void;
}) {
    const [isHolding, setIsHolding] = useState(false);
    const [dragOverState, setDragOverState] = useState<'before' | 'after' | null>(null);
    const noteRef = useRef<HTMLDivElement>(null);
    const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const highlightedTitle = highlightText(note.title, search.query, search.options);

    function handleMouseDown() {
        holdTimeoutRef.current = setTimeout(() => {
            setIsHolding(true);
        }, 500);
    }

    function handleMouseUp() {
        if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
        setIsHolding(false);
    }

    function handleMouseLeave() {
        if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
        setIsHolding(false);
    }

    function handleDragStart(e: React.DragEvent) {
        if (!isHolding) {
            e.preventDefault();
            return;
        }

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', note.id);
        onDragStart?.(note.id);
    }

    function handleDragOver(e: React.DragEvent) {
        if (!draggedNoteId || draggedNoteId === note.id) return;

        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const rect = noteRef.current?.getBoundingClientRect();
        if (!rect) return;

        const y = e.clientY - rect.top;
        const height = rect.height;
        const threshold = height / 3;

        const newState: 'before' | 'after' = y < threshold ? 'before' : 'after';
        setDragOverState(newState);
    }

    function handleDragLeave(e: React.DragEvent) {
        const rect = noteRef.current?.getBoundingClientRect();
        if (!rect) return;

        const margin = 5;
        const x = e.clientX;
        const y = e.clientY;

        const isOutside =
            x < rect.left - margin ||
            x > rect.right + margin ||
            y < rect.top - margin ||
            y > rect.bottom + margin;

        if (isOutside) {
            setDragOverState(null);
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();

        if (!draggedNoteId || !dragOverState || draggedNoteId === note.id) return;

        onNoteDrop?.(draggedNoteId, note.id, dragOverState);
        setTimeout(() => {
            setDragOverState(null);
        }, 100);
    }

    return (
        <div>
            {/* Drop indicator before note */}
            {dragOverState === 'before' && (
                <div className="h-0.5 bg-primary opacity-100 mb-1" />
            )}

            <div
                ref={noteRef}
                draggable={isHolding}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={() => {
                    handleDragEnd();
                    setIsHolding(false);
                    setDragOverState(null);
                }}
                onClick={() => onNoteSelect?.(note)}
                className={`
                    font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                    hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground
                    hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all
                    flex items-center gap-2 mb-1
                    ${isHolding ? 'cursor-grabbing' : 'cursor-pointer'}
                    ${draggedNoteId === note.id ? 'opacity-50' : ''}
                    ${selectedNoteId === note.id ? 'bg-accent/40' : ''}
                    ${dragOverState ? 'bg-accent/20' : ''}
                `}
            >
                <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" clipRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 102 0V3h4v1a1 1 0 102 0V3a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" />
                </svg>
                <span
                    className="text-xs truncate"
                    dangerouslySetInnerHTML={{ __html: highlightedTitle }}
                />
            </div>

            {/* Drop indicator after note */}
            {dragOverState === 'after' && (
                <div className="h-0.5 bg-primary opacity-100 mb-1" />
            )}
        </div>
    );
}

export function SearchableSidebar({
    folders,
    notes,
    isLoading,
    onNewNote,
    onNewFolder,
    onFolderClick,
    onToggleAllFolders,
    onNoteClick,
    children,
    draggedFolderId,
    draggedNoteId,
    onDragStart,
    onNoteDragStart,
    onDragEnd,
    onDrop,
    onNoteDrop,
    onNoteReorder,
    onDropOnRoot,
    onDragOverRoot,
    onDragLeaveRoot,
    dragOverRoot,
    selectedNoteId,
}: props) {
    const search = useSearch();

    const filteredFolders = folders.filter(folder => {
        if (folder.deletedAt) return false;
        if (folder.parent) return false;
        return matchesSearch(folder.name, search.query, search.options);
    });

    const filteredRootNotes = notes.filter(note => {
        if (note.folder) return false;
        return matchesSearch(note.title, search.query, search.options);
    });

    function handleToggleAllFolders() {
        onToggleAllFolders?.();
    }

    function handleNoteClick(note: Note) {
        onNoteClick?.(note);
    }

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <aside className="w-48 transition-all border-r duration-300 overflow-hidden bg-background/50 backdrop-blur-sm">
            <div className="relative top-0 flex flex-col h-10 w-full border-b bg-background overflow-hidden">
                <Toolbar
                    isSearchOpen={search.isOpen}
                    onSearchToggle={search.toggle}
                    onNewNote={onNewNote}
                    onNewFolder={onNewFolder}
                    onToggleAllFolders={handleToggleAllFolders}
                />

                <div className={`absolute pb-[0.5px] flex flex-row items-center justify-center w-full h-full px-[5px] gap-1 shrink-0 transition-all duration-300 ${search.isOpen ? 'translate-y-0' : 'translate-y-12'}`}>
                    <SearchBar
                        query={search.query}
                        onQueryChange={search.setQuery}
                        options={search.options}
                        onOptionsChange={search.setOptions}
                        onClose={search.close}
                    />
                </div>
            </div>

            <div className="p-4 flex items-center justify-between">
                <h1 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">searchable-sidebar.tsx</h1>
                <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={onNewFolder} className="h-8 w-8" title="New folder">
                        <FolderPlus className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={onNewNote} className="h-8 w-8" title="New note">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div
                className={`overflow-y-auto h-[calc(100vh-65px)] px-2 transition-colors ${dragOverRoot ? 'bg-primary/10' : ''}`}
                onDragOver={onDragOverRoot}
                onDragLeave={onDragLeaveRoot}
                onDrop={onDropOnRoot}
            >
                {search.query && (
                    <div className="mb-2 p-2 text-xs text-muted-foreground bg-muted/50 rounded">
                        Searching for: <strong>{search.query}</strong>
                        {search.options.caseSensitive && ' (Case Sensitive)'}
                        {search.options.wholeWord && ' (Whole Word)'}
                    </div>
                )}

                {children || (
                    <>
                        {filteredFolders.map((folder) => (
                            <FolderItem
                                key={folder.id}
                                folder={folder}
                                folders={folders}
                                notes={notes}
                                search={search}
                                draggedFolderId={draggedFolderId}
                                draggedNoteId={draggedNoteId}
                                onDragStart={onDragStart}
                                onDragEnd={onDragEnd}
                                onDrop={onDrop}
                                onNoteDrop={onNoteDrop}
                                onFolderClick={onFolderClick}
                                onNoteClick={onNoteClick}
                                onNoteReorder={onNoteReorder}
                                onNoteDragStart={onNoteDragStart}
                                selectedNoteId={selectedNoteId}
                                onToggleAllFolders={handleToggleAllFolders}
                            />
                        ))}

                        {filteredRootNotes
                            .sort((a, b) => (a.position || 0) - (b.position || 0))
                            .map((note) => (
                                <NoteItem
                                    key={note.id}
                                    note={note}
                                    search={search}
                                    selectedNoteId={selectedNoteId}
                                    draggedNoteId={draggedNoteId}
                                    onNoteSelect={onNoteClick}
                                    onDragStart={onNoteDragStart}
                                    onDragEnd={onDragEnd}
                                    onNoteDrop={onNoteReorder}
                                />
                            ))}

                        {filteredFolders.length === 0 && filteredRootNotes.length === 0 && (
                            <div className="p-4 text-center text-muted-foreground">
                                {search.query ? (
                                    <p className="text-sm">No results found for "{search.query}"</p>
                                ) : (
                                    <>
                                        <p className="text-sm">No notes or folders yet.</p>
                                        <p className="text-xs mt-2">Click + to create one.</p>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
}