"use client";

import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { NoteFile, NoteFolder } from "@/types/notes";
import { cn } from "@/shared/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/shared/ui/tooltip";
import {
    FileText,
    Folder,
    PanelTopClose,
    Search,
    UnfoldVertical,
    X,
} from "lucide-react";
import { useSidebarStore } from "./sidebar/store";
import type { SidebarSection as SidebarSectionType } from "./sidebar/types";
import {
    FavoritesSection,
    RecentsSection,
    ProjectsSection,
    CustomSection,
    FileTreeSection,
    SidebarConfigManager,
    JournalSection,
} from "./sidebar";
import { NewFolderNoteIcon, NewNoteIcon } from "./sidebar/header-icons";

const SEARCH_SWAP_EASE = [0.22, 1, 0.36, 1] as const;
const SEARCH_SWAP_TRANSITION: Transition = {
    duration: 0.18,
    ease: SEARCH_SWAP_EASE,
};
const REDUCED_SEARCH_SWAP_TRANSITION: Transition = {
    duration: 0.1,
    ease: "linear",
};

interface SidebarPanelProps {
    files: NoteFile[];
    folders: NoteFolder[];
    filesById: Map<string, NoteFile>;
    foldersById: Map<string, NoteFolder>;
    activeFileId: string;
    onFileSelect: (id: string) => void;
    onToggleFolder: (id: string) => void;
    onCollapseAllFolders?: () => void;
    onExpandAllFolders?: () => void;
    onCreateFile: () => void;
    onCreateFolder: () => void;
    onRenameFile: (id: string, name: string) => void;
    onRenameFolder: (id: string, name: string) => void;
    onDeleteFile: (id: string) => void;
    onDeleteFolder: (id: string) => void;
    onMoveFile: (fileId: string, newParentId: string | null) => void;
    onMoveFolder: (folderId: string, newParentId: string | null) => void;
    getFilesInFolder: (parentId: string | null) => NoteFile[];
    getFoldersInFolder: (parentId: string | null) => NoteFolder[];
    countDescendants: (folderId: string) => number;
    className?: string;
    onRequestClose?: () => void;
    showCloseButton?: boolean;
}

function HeaderActionTooltip({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="bottom" className="px-2 py-1 text-xs">
                {label}
            </TooltipContent>
        </Tooltip>
    );
}

export function SidebarPanel({
    files,
    folders,
    filesById,
    foldersById,
    activeFileId,
    onFileSelect,
    onToggleFolder,
    onCollapseAllFolders,
    onExpandAllFolders,
    onCreateFile,
    onCreateFolder,
    onRenameFile,
    onRenameFolder,
    onDeleteFile,
    onDeleteFolder,
    onMoveFile,
    onMoveFolder,
    getFilesInFolder,
    getFoldersInFolder,
    countDescendants,
    className,
    onRequestClose,
    showCloseButton = false,
}: SidebarPanelProps) {
    const sidebarStore = useSidebarStore();
    const prefersReducedMotion = useReducedMotion();
    const showSectionHeaders = sidebarStore.config.showSectionHeaders;
    const compactMode = sidebarStore.config.compactMode;
    const sections = sidebarStore.getSections();
    const searchSwapTransition = prefersReducedMotion
        ? REDUCED_SEARCH_SWAP_TRANSITION
        : SEARCH_SWAP_TRANSITION;
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
    const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(
        null,
    );
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const sidebarPanelRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchSwapRef = useRef<HTMLDivElement>(null);
    const hasSearchSection = sections.some(
        (section) => section.type === "search",
    );
    const visibleSections = useMemo(
        () => sections.filter((section) => section.type !== "search"),
        [sections],
    );

    const searchResults = useMemo(() => {
        if (!deferredSearchQuery.trim()) {
            return { files: [], folders: [] };
        }

        const lowerQuery = deferredSearchQuery.toLowerCase();

        return {
            files: files.filter(
                (file) =>
                    file.name.toLowerCase().includes(lowerQuery) ||
                    (file.tags ?? []).some((tag) => tag.toLowerCase().includes(lowerQuery)),
            ),
            folders: folders.filter((folder) =>
                folder.name.toLowerCase().includes(lowerQuery),
            ),
        };
    }, [deferredSearchQuery, files, folders]);

    const handleFileSelect = useCallback(
        (id: string) => {
            sidebarStore.addToRecents(id, "file");
            onFileSelect(id);
            onRequestClose?.();
        },
        [sidebarStore, onFileSelect, onRequestClose],
    );

    const openConfigPanel = useCallback(() => {
        setIsConfigOpen(true);
    }, []);

    const closeSearch = useCallback(() => {
        setIsSearchOpen(false);
        setSearchQuery("");
        requestAnimationFrame(() => {
            const activeTreeItem = sidebarPanelRef.current?.querySelector<HTMLElement>(
                '[role="treeitem"][tabindex="0"]',
            );
            activeTreeItem?.focus();
        });
    }, []);

    const handleSearchSwapBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            if (!searchSwapRef.current?.contains(activeElement)) {
                closeSearch();
            }
        }, 0);
    }, [closeSearch]);

    const openSearch = useCallback(() => {
        setIsSearchOpen(true);
    }, []);

    const handleSearchFileSelect = useCallback(
        (id: string) => {
            handleFileSelect(id);
            closeSearch();
        },
        [closeSearch, handleFileSelect],
    );

    const handleSearchFolderSelect = useCallback(
        (id: string) => {
            onToggleFolder(id);
            closeSearch();
        },
        [closeSearch, onToggleFolder],
    );

    useEffect(() => {
        if (!hasSearchSection && isSearchOpen) {
            closeSearch();
        }
    }, [closeSearch, hasSearchSection, isSearchOpen]);

    useEffect(() => {
        if (isSearchOpen) {
            searchInputRef.current?.focus();
        }
    }, [isSearchOpen]);

    const hasSearchResults =
        searchResults.files.length > 0 || searchResults.folders.length > 0;
    const fileTreeSection = visibleSections.find(
        (section) => section.type === "file-tree",
    );
    const navigationSections = visibleSections.filter(
        (section) => section.type !== "file-tree",
    );

    const handleSectionReorder = useCallback(
        (draggedId: string, targetId: string) => {
            if (draggedId === targetId) return;

            const orderedSections = [...sidebarStore.config.sections].toSorted(
                (left, right) => {
                    if (left.type === "file-tree" && right.type !== "file-tree") return -1;
                    if (right.type === "file-tree" && left.type !== "file-tree") return 1;
                    return left.order - right.order;
                },
            );
            const movableIds = orderedSections
                .filter((section) => section.type !== "file-tree")
                .map((section) => section.id);
            const draggedIndex = movableIds.indexOf(draggedId);
            const targetIndex = movableIds.indexOf(targetId);

            if (draggedIndex === -1 || targetIndex === -1) return;

            const nextMovableIds = [...movableIds];
            nextMovableIds.splice(draggedIndex, 1);
            nextMovableIds.splice(targetIndex, 0, draggedId);

            const pinnedIds = orderedSections
                .filter((section) => section.type === "file-tree")
                .map((section) => section.id);

            sidebarStore.reorderSections([...pinnedIds, ...nextMovableIds]);
        },
        [sidebarStore],
    );

    const getSectionDragProps = useCallback(
        (sectionId: string) => ({
            isDraggable: true,
            isDragging: draggedSectionId === sectionId,
            isDropTarget: dropTargetSectionId === sectionId,
            onDragStart: (event: React.DragEvent) => {
                setDraggedSectionId(sectionId);
                setDropTargetSectionId(null);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", sectionId);
            },
            onDragOver: (event: React.DragEvent) => {
                event.preventDefault();
                if (draggedSectionId && draggedSectionId !== sectionId) {
                    setDropTargetSectionId(sectionId);
                }
                event.dataTransfer.dropEffect = "move";
            },
            onDrop: (event: React.DragEvent) => {
                event.preventDefault();
                const sourceSectionId =
                    draggedSectionId || event.dataTransfer.getData("text/plain");
                if (sourceSectionId) {
                    handleSectionReorder(sourceSectionId, sectionId);
                }
                setDraggedSectionId(null);
                setDropTargetSectionId(null);
            },
            onDragEnd: () => {
                setDraggedSectionId(null);
                setDropTargetSectionId(null);
            },
        }),
        [draggedSectionId, dropTargetSectionId, handleSectionReorder],
    );

    const getSectionMoveProps = useCallback(
        (sectionId: string) => {
            const orderedSections = [...sidebarStore.config.sections].toSorted((left, right) => {
                if (left.type === "file-tree" && right.type !== "file-tree") return -1;
                if (right.type === "file-tree" && left.type !== "file-tree") return 1;
                return left.order - right.order;
            });
            const movableIds = orderedSections
                .filter((section) => section.type !== "file-tree")
                .map((section) => section.id);
            const currentIndex = movableIds.indexOf(sectionId);

            const move = (direction: "up" | "down") => {
                if (currentIndex === -1) return;
                const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
                if (targetIndex < 0 || targetIndex >= movableIds.length) return;
                const nextMovableIds = [...movableIds];
                const [movedId] = nextMovableIds.splice(currentIndex, 1);
                nextMovableIds.splice(targetIndex, 0, movedId);
                const pinnedIds = orderedSections
                    .filter((section) => section.type === "file-tree")
                    .map((section) => section.id);
                sidebarStore.reorderSections([...pinnedIds, ...nextMovableIds]);
            };

            return {
                onMoveUp: () => move("up"),
                onMoveDown: () => move("down"),
                canMoveUp: currentIndex > 0,
                canMoveDown: currentIndex !== -1 && currentIndex < movableIds.length - 1,
            };
        },
        [sidebarStore],
    );

    const renderSection = (section: SidebarSectionType) => {
        switch (section.type) {
            case "search":
                return null;

            case "favorites":
                // Only show favorites section if there are favorites
                if (sidebarStore.config.favorites.length === 0) return null;
                return (
                    <FavoritesSection
                        key={section.id}
                        favorites={sidebarStore.config.favorites}
                        filesById={filesById}
                        foldersById={foldersById}
                        activeFileId={activeFileId}
                        isCollapsed={section.isCollapsed}
                        showHeader={showSectionHeaders}
                        compactMode={compactMode}
                        onToggleCollapse={() =>
                            sidebarStore.toggleSectionCollapse(section.id)
                        }
                        onToggleVisibility={() =>
                            sidebarStore.toggleSectionVisibility(section.id)
                        }
                        onManageSections={openConfigPanel}
                        onFileSelect={handleFileSelect}
                        onRemoveFromFavorites={sidebarStore.removeFromFavorites}
                        {...getSectionMoveProps(section.id)}
                        {...getSectionDragProps(section.id)}
                    />
                );

            case "recents":
                return (
                    <RecentsSection
                        key={section.id}
                        recents={sidebarStore.getRecents()}
                        filesById={filesById}
                        foldersById={foldersById}
                        activeFileId={activeFileId}
                        isCollapsed={section.isCollapsed}
                        showHeader={showSectionHeaders}
                        compactMode={compactMode}
                        onToggleCollapse={() =>
                            sidebarStore.toggleSectionCollapse(section.id)
                        }
                        onToggleVisibility={() =>
                            sidebarStore.toggleSectionVisibility(section.id)
                        }
                        onManageSections={openConfigPanel}
                        onFileSelect={handleFileSelect}
                        onClearRecents={sidebarStore.clearRecents}
                        {...getSectionMoveProps(section.id)}
                        {...getSectionDragProps(section.id)}
                    />
                );

            case "projects":
                return (
                    <ProjectsSection
                        key={section.id}
                        projects={sidebarStore.getProjects()}
                        files={files}
                        folders={folders}
                        activeFileId={activeFileId}
                        isCollapsed={section.isCollapsed}
                        showHeader={showSectionHeaders}
                        compactMode={compactMode}
                        onToggleCollapse={() =>
                            sidebarStore.toggleSectionCollapse(section.id)
                        }
                        onToggleVisibility={() =>
                            sidebarStore.toggleSectionVisibility(section.id)
                        }
                        onManageSections={openConfigPanel}
                        onFileSelect={handleFileSelect}
                        onCreateProject={sidebarStore.createProject}
                        onUpdateProject={sidebarStore.updateProject}
                        onDeleteProject={sidebarStore.deleteProject}
                        onRemoveFromProject={sidebarStore.removeFromProject}
                        {...getSectionMoveProps(section.id)}
                        {...getSectionDragProps(section.id)}
                    />
                );

            case "journal":
                return (
                    <JournalSection
                        key={section.id}
                        isCollapsed={section.isCollapsed}
                        showHeader={showSectionHeaders}
                        compactMode={compactMode}
                        onToggleCollapse={() =>
                            sidebarStore.toggleSectionCollapse(section.id)
                        }
                        onToggleVisibility={() =>
                            sidebarStore.toggleSectionVisibility(section.id)
                        }
                        {...getSectionMoveProps(section.id)}
                        {...getSectionDragProps(section.id)}
                    />
                );

            case "file-tree":
                return (
                    <FileTreeSection
                        key={section.id}
                        files={files}
                        folders={folders}
                        activeFileId={activeFileId}
                        isCollapsed={section.isCollapsed}
                        compactMode={compactMode}
                        onToggleCollapse={() =>
                            sidebarStore.toggleSectionCollapse(section.id)
                        }
                        onToggleVisibility={() =>
                            sidebarStore.toggleSectionVisibility(section.id)
                        }
                        onFileSelect={handleFileSelect}
                        onToggleFolder={onToggleFolder}
                        onRenameFile={onRenameFile}
                        onRenameFolder={onRenameFolder}
                        onDeleteFile={onDeleteFile}
                        onDeleteFolder={onDeleteFolder}
                        onMoveFile={onMoveFile}
                        onMoveFolder={onMoveFolder}
                        getFilesInFolder={getFilesInFolder}
                        getFoldersInFolder={getFoldersInFolder}
                        countDescendants={countDescendants}
                    />
                );

            default:
                return (
                    <CustomSection
                        key={section.id}
                        section={section}
                        filesById={filesById}
                        foldersById={foldersById}
                        activeFileId={activeFileId}
                        isCollapsed={section.isCollapsed}
                        showHeader={showSectionHeaders}
                        compactMode={compactMode}
                        onToggleCollapse={() =>
                            sidebarStore.toggleSectionCollapse(section.id)
                        }
                        onToggleVisibility={() =>
                            sidebarStore.toggleSectionVisibility(section.id)
                        }
                        onRename={(name) => sidebarStore.renameSection(section.id, name)}
                        onDelete={() => sidebarStore.removeSection(section.id)}
                        onFileSelect={handleFileSelect}
                        onRemoveFromSection={sidebarStore.removeFromCustomSection}
                        {...getSectionMoveProps(section.id)}
                        {...getSectionDragProps(section.id)}
                    />
                );
        }
    };

    return (
        <div
            ref={sidebarPanelRef}
            className={cn(
                "flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
                className,
            )}
        >
            <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-xl">
                <div className="relative flex h-11 items-center justify-between overflow-hidden px-3">
                    <motion.div
                        animate={
                            isSearchOpen
                                ? { y: -8, opacity: 0, scale: 0.985 }
                                : { y: 0, opacity: 1, scale: 1 }
                        }
                        transition={searchSwapTransition}
                        className={cn(
                            "flex h-full w-full items-center justify-between gap-3 will-change-transform",
                            isSearchOpen && "pointer-events-none",
                        )}
                        inert={isSearchOpen}
                        aria-hidden={isSearchOpen}
                    >
                        <TooltipProvider delayDuration={120}>
                            <div className="flex items-center gap-2 md:gap-2.5 w-full justify-between">
                                <HeaderActionTooltip label="New note">
                                    <button
                                        onClick={onCreateFile}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                                        aria-label="New note"
                                    >
                                        <NewNoteIcon />
                                    </button>
                                </HeaderActionTooltip>
                                <HeaderActionTooltip label="New folder">
                                    <button
                                        onClick={onCreateFolder}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                                        aria-label="New folder"
                                    >
                                        <NewFolderNoteIcon />
                                    </button>
                                </HeaderActionTooltip>
                                <HeaderActionTooltip label="Manage sections">
                                    <button
                                        onClick={openConfigPanel}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                                        aria-label="Manage sections"
                                    >
                                        <PanelTopClose className="h-4 w-4" strokeWidth={1.5} />
                                    </button>
                                </HeaderActionTooltip>
                                {(onCollapseAllFolders || onExpandAllFolders) && (
                                    <div className="relative flex">
                                        <HeaderActionTooltip label="Toggle all folders">
                                            <button
                                                onClick={() => {
                                                    if (onCollapseAllFolders && onExpandAllFolders) {
                                                        const anyExpanded = folders.some((f) => f.isOpen);
                                                        if (anyExpanded) {
                                                            onCollapseAllFolders();
                                                        } else {
                                                            onExpandAllFolders();
                                                        }
                                                    } else if (onCollapseAllFolders) {
                                                        onCollapseAllFolders();
                                                    } else if (onExpandAllFolders) {
                                                        onExpandAllFolders();
                                                    }
                                                }}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                                                aria-label="Toggle all folders"
                                            >
                                                <UnfoldVertical className="h-4 w-4" strokeWidth={1.5} />
                                            </button>
                                        </HeaderActionTooltip>
                                    </div>
                                )}
                                {hasSearchSection && (
                                    <HeaderActionTooltip label="Search notes">
                                        <button
                                            onClick={openSearch}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                                            aria-label="Search notes"
                                        >
                                            <Search className="h-4 w-4" strokeWidth={1.5} />
                                        </button>
                                    </HeaderActionTooltip>
                                )}
                                <SidebarConfigManager
                                    open={isConfigOpen}
                                    onOpenChange={setIsConfigOpen}
                                    hideTrigger
                                    sections={sidebarStore.config.sections}
                                    showSectionHeaders={sidebarStore.config.showSectionHeaders}
                                    compactMode={sidebarStore.config.compactMode}
                                    onReorderSections={sidebarStore.reorderSections}
                                    onToggleSectionVisibility={sidebarStore.toggleSectionVisibility}
                                    onAddCustomSection={sidebarStore.addCustomSection}
                                    onRemoveSection={sidebarStore.removeSection}
                                    onRenameSection={sidebarStore.renameSection}
                                    onToggleShowSectionHeaders={
                                        sidebarStore.toggleShowSectionHeaders
                                    }
                                    onToggleCompactMode={sidebarStore.toggleCompactMode}
                                    onResetToDefaults={sidebarStore.resetToDefaults}
                                />
                            </div>
                        </TooltipProvider>

                        {showCloseButton && (
                            <button
                                onClick={onRequestClose}
                                className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground md:hidden"
                                title="Close sidebar"
                            >
                                <X className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                        )}
                    </motion.div>

                    {hasSearchSection && (
                        <motion.div
                            animate={
                                isSearchOpen
                                    ? { y: 0, opacity: 1, scale: 1 }
                                    : { y: 8, opacity: 0, scale: 0.985 }
                            }
                            transition={searchSwapTransition}
                            ref={searchSwapRef}
                            onBlur={handleSearchSwapBlur}
                            className={cn(
                                "absolute inset-x-0 top-0 flex h-11 items-center px-3 will-change-transform",
                                !isSearchOpen && "pointer-events-none",
                            )}
                            inert={!isSearchOpen}
                            aria-hidden={!isSearchOpen}
                        >
                            <div className="flex items-center gap-2 border border-sidebar-border bg-sidebar-accent/55 px-3 shadow-inner">
                                <Search
                                    className="h-4 w-4 shrink-0 text-muted-foreground"
                                    strokeWidth={1.5}
                                />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                            closeSearch();
                                        }
                                    }}
                                    placeholder="Search"
                                    className="h-full w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                                />
                                <button
                                    onClick={closeSearch}
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                                    title="Close search"
                                >
                                    <X className="h-4 w-4" strokeWidth={1.5} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>

            <div
                className={cn(
                    "flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 md:pb-0",
                    compactMode && "pt-1 text-sm",
                )}
            >
                {searchQuery.trim() ? (
                    <div className="px-3 py-3">
                        {hasSearchResults ? (
                            <div className="overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar-accent/40 shadow-lg">
                                <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/52">
                                            Quick Jump
                                        </p>
                                        <p className="text-[12px] text-sidebar-foreground/72">
                                            {searchResults.files.length +
                                                searchResults.folders.length}{" "}
                                            results for "{searchQuery.trim()}"
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-sidebar-border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/48">
                                        Search
                                    </span>
                                </div>
                                {searchResults.folders.length > 0 && (
                                    <div className="border-b border-sidebar-border p-2 last:border-b-0">
                                        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/58">
                                            Folders
                                        </p>
                                        {searchResults.folders.map((folder) => (
                                            <button
                                                key={folder.id}
                                                onClick={() => handleSearchFolderSelect(folder.id)}
                                                className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sidebar-foreground/82 transition-colors hover:border-sidebar-border hover:bg-sidebar hover:text-sidebar-foreground"
                                            >
                                                <Folder
                                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                                    strokeWidth={1.5}
                                                />
                                                <span className="truncate text-[13px]">
                                                    {folder.name}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {searchResults.files.length > 0 && (
                                    <div className="p-2">
                                        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/58">
                                            Files
                                        </p>
                                        {searchResults.files.slice(0, 10).map((file) => (
                                            <button
                                                key={file.id}
                                                onClick={() => handleSearchFileSelect(file.id)}
                                                className={cn(
                                                    "flex min-h-11 w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left transition-colors",
                                                    file.id === activeFileId
                                                        ? "border-sidebar-border bg-sidebar text-sidebar-foreground"
                                                        : "text-sidebar-foreground/82 hover:border-sidebar-border hover:bg-sidebar hover:text-sidebar-foreground",
                                                )}
                                            >
                                                <FileText
                                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                                    strokeWidth={1.5}
                                                />
                                                <span className="truncate text-[13px]">
                                                    {file.name}
                                                </span>
                                            </button>
                                        ))}
                                        {searchResults.files.length > 10 && (
                                            <p className="px-2 py-1 text-[10px] text-sidebar-foreground/52">
                                                +{searchResults.files.length - 10} more results
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/25 px-4 py-6 text-center">
                                <p className="text-xs font-medium text-sidebar-foreground/74">
                                    No results found
                                </p>
                                <p className="mt-1 text-[11px] text-sidebar-foreground/46">
                                    Try a note title, folder name, or a phrase from the editor
                                    content.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {fileTreeSection ? renderSection(fileTreeSection) : null}
                        {navigationSections.map(renderSection)}
                    </>
                )}
            </div>
        </div>
    );
}
