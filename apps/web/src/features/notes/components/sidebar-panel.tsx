"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FAST_SWAP_TRANSITION, pickTransition } from "@/shared/lib/motion";
import { NoteFile, NoteFolder } from "@/types/notes";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useShortcutHint, useShortcutScope, type ShortcutId } from "@/core/shortcuts";
import {
	Command,
	FilePlus,
	FileText,
	Folder,
	FolderPlus,
	FoldVertical,
	PanelTopClose,
	Search,
	UnfoldVertical,
	X,
} from "lucide-react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { useSidebarStore } from "./sidebar/store";
import type { SidebarSection as SidebarSectionType } from "./sidebar/types";
import {
	FavoritesSection,
	RecentsSection,
	CustomSection,
	SidebarConfigManager,
	JournalSection,
} from "./sidebar";
import { SharedSection } from "./sidebar/shared-section";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { useIsGuestWorkspace } from "@/core/workspace-backend";
import { FileList } from "./file-list";
import { NewFolderNoteIcon, NewNoteIcon } from "./sidebar/header-icons";
import type { NoteTreeActions, NoteTreeQueries } from "../lib/tree-actions";
import { useNoteSearch, type NoteSearchHit } from "../hooks/use-note-search";

type SearchFileResult = {
	file: NoteFile;
	snippet?: string;
};

type SidebarPanelProps = {
	files: NoteFile[];
	folders: NoteFolder[];
	filesById: Map<string, NoteFile>;
	foldersById: Map<string, NoteFolder>;
	activeFileId: string;
	isFilesLoading?: boolean;
	actions: NoteTreeActions;
	queries: NoteTreeQueries;
	onCollapseAllFolders?: () => void;
	onExpandAllFolders?: () => void;
	onCreateFile: (options?: { projectId?: string }) => void;
	onCreateFolder: () => void;
	onCreationParentChange?: (folderId: string | null) => void;
	onOpenCommandPalette?: () => void;
	className?: string;
	onRequestClose?: () => void;
	showCloseButton?: boolean;
	sidebarWidth?: number;
}

function HeaderActionTooltip({
	label,
	shortcutId,
	children,
}: {
	label: string;
	shortcutId?: ShortcutId;
	children: React.ReactNode;
}) {
	const shortcut = useShortcutHint(shortcutId);

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="bottom" className="px-2 py-1 text-xs" shortcut={shortcut}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export const SidebarPanel = memo(function SidebarPanel({
	files,
	folders,
	filesById,
	foldersById,
	activeFileId,
	isFilesLoading = false,
	actions,
	queries,
	onCollapseAllFolders,
	onExpandAllFolders,
	onCreateFile,
	onCreateFolder,
	onCreationParentChange,
	onOpenCommandPalette,
	className,
	onRequestClose,
	showCloseButton = false,
	sidebarWidth,
}: SidebarPanelProps) {
	const { onFileSelect, onToggleFolder, onFilePrefetch } = actions;
	const newNoteHint = useShortcutHint("notes.newNote");
	const newFolderHint = useShortcutHint("notes.newFolder");
	const isGuest = useIsGuestWorkspace();
	const sidebarStore = useSidebarStore();
	const prefersReducedMotion = useReducedMotion();
	const showSectionHeaders = sidebarStore.config.showSectionHeaders;
	const compactMode = sidebarStore.config.compactMode;
	const isNarrow = sidebarWidth !== undefined && sidebarWidth < 220;
	const isVeryNarrow = sidebarWidth !== undefined && sidebarWidth < 176;
	const effectiveCompactMode = compactMode || isNarrow;
	const showTreeGuides = sidebarStore.config.showTreeGuides;
	const sections = sidebarStore.getSections();
	const searchSwapTransition = pickTransition(
		Boolean(prefersReducedMotion),
		FAST_SWAP_TRANSITION,
	);
	const [isConfigOpen, setIsConfigOpen] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [sharedSectionCollapsed, setSharedSectionCollapsed] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
	const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const sidebarPanelRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchSwapRef = useRef<HTMLDivElement>(null);
	const searchResultsRef = useRef<HTMLDivElement>(null);
	const hasSearchSection = sections.some((section) => section.type === "search");
	const visibleSections = useMemo(
		() => sections.filter((section) => section.type !== "search"),
		[sections],
	);

	const { supportsContentSearch, hits: searchHits, isSearching } = useNoteSearch(searchQuery);

	const searchedFolders = useMemo(() => {
		if (!deferredSearchQuery.trim()) {
			return [];
		}
		const lowerQuery = deferredSearchQuery.toLowerCase();
		return folders.filter((folder) => folder.name.toLowerCase().includes(lowerQuery));
	}, [deferredSearchQuery, folders]);

	const inMemoryFileResults = useMemo<SearchFileResult[]>(() => {
		if (supportsContentSearch || !deferredSearchQuery.trim()) {
			return [];
		}
		const lowerQuery = deferredSearchQuery.toLowerCase();
		return files
			.filter(
				(file) =>
					file.name.toLowerCase().includes(lowerQuery) ||
					(file.tags ?? []).some((tag) => tag.toLowerCase().includes(lowerQuery)),
			)
			.map((file) => ({ file }));
	}, [deferredSearchQuery, files, supportsContentSearch]);

	const contentFileResults = useMemo<SearchFileResult[]>(() => {
		if (!supportsContentSearch) {
			return [];
		}
		return searchHits.map((hit: NoteSearchHit) => {
			const resolved = filesById.get(hit.id);
			const file: NoteFile = resolved ?? {
				id: hit.id,
				name: hit.name,
				content: "",
				richContent: [],
				preferredEditorMode: "block",
				createdAt: new Date(),
				modifiedAt: new Date(),
				parentId: null,
			};
			return { file, snippet: hit.snippet };
		});
	}, [supportsContentSearch, searchHits, filesById]);

	const searchResults = useMemo(
		() => ({
			files: supportsContentSearch ? contentFileResults : inMemoryFileResults,
			folders: searchedFolders,
		}),
		[supportsContentSearch, contentFileResults, inMemoryFileResults, searchedFolders],
	);

	const maxSearchResultsPerType = 10;
	const visibleSearchFiles = searchResults.files.slice(0, maxSearchResultsPerType);
	const visibleSearchFolders = searchResults.folders.slice(0, maxSearchResultsPerType);
	const totalSearchResults = searchResults.files.length + searchResults.folders.length;

	const handleFileSelect = useCallback(
		(id: string) => {
			sidebarStore.addToRecents(id, "file");
			onFileSelect(id);
			onRequestClose?.();
		},
		[sidebarStore, onFileSelect, onRequestClose],
	);

	const fileTreeActions = useMemo<NoteTreeActions>(
		() => ({ ...actions, onFileSelect: handleFileSelect }),
		[actions, handleFileSelect],
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
			const stillInSearch =
				searchSwapRef.current?.contains(activeElement) ||
				searchResultsRef.current?.contains(activeElement);
			if (!stillInSearch) {
				closeSearch();
			}
		}, 0);
	}, [closeSearch]);

	const openSearch = useCallback(() => {
		if (!hasSearchSection) return;
		if (isSearchOpen) {
			searchInputRef.current?.focus();
			return;
		}
		setIsSearchOpen(true);
	}, [hasSearchSection, isSearchOpen]);

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

	useShortcutScope(
		"notes",
		{
			"notes.focusSidebarSearch": openSearch,
		},
		{
			active: hasSearchSection,
		},
	);

	useEffect(() => {
		if (!hasSearchSection && isSearchOpen) {
			closeSearch();
		}
	}, [closeSearch, hasSearchSection, isSearchOpen]);

	useEffect(() => {
		function handleGlobalSearchFocus() {
			openSearch();
		}

		window.addEventListener("skriuw:focus-sidebar-search", handleGlobalSearchFocus);
		return () => {
			window.removeEventListener("skriuw:focus-sidebar-search", handleGlobalSearchFocus);
		};
	}, [openSearch]);

	useEffect(() => {
		if (isSearchOpen) {
			searchInputRef.current?.focus();
		}
	}, [isSearchOpen]);

	const hasSearchResults = totalSearchResults > 0;
	const fileTreeSection = visibleSections.find((section) => section.type === "file-tree");
	const journalSection = visibleSections.find((section) => section.type === "journal");
	const navigationSections = visibleSections.filter(
		(section) => section.type !== "file-tree" && section.type !== "journal",
	);

	const handleSectionReorder = useCallback(
		(draggedId: string, targetId: string) => {
			if (draggedId === targetId) return;

			const orderedSections = [...sidebarStore.config.sections].toSorted((left, right) => {
				if (left.type === "file-tree" && right.type !== "file-tree") return -1;
				if (right.type === "file-tree" && left.type !== "file-tree") return 1;
				return left.order - right.order;
			});
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
						compactMode={effectiveCompactMode}
						onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
						onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
						onManageSections={openConfigPanel}
						onFileSelect={handleFileSelect}
						onFilePrefetch={onFilePrefetch}
						onRemoveFromFavorites={sidebarStore.removeFromFavorites}
						{...getSectionMoveProps(section.id)}
						{...getSectionDragProps(section.id)}
					/>
				);

			case "recents":
				// Only show recents once something has actually been opened.
				if (sidebarStore.getRecents().length === 0) return null;
				return (
					<RecentsSection
						key={section.id}
						recents={sidebarStore.getRecents()}
						filesById={filesById}
						foldersById={foldersById}
						activeFileId={activeFileId}
						isCollapsed={section.isCollapsed}
						showHeader={showSectionHeaders}
						compactMode={effectiveCompactMode}
						onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
						onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
						onManageSections={openConfigPanel}
						onFileSelect={handleFileSelect}
						onFilePrefetch={onFilePrefetch}
						onClearRecents={sidebarStore.clearRecents}
						{...getSectionMoveProps(section.id)}
						{...getSectionDragProps(section.id)}
					/>
				);

			// "projects" is retired and migrated into custom sections; render nothing
			// if a stale section reference ever survives migration.
			case "projects":
				return null;

			case "journal":
				return (
					<JournalSection
						key={section.id}
						isCollapsed={section.isCollapsed}
						showHeader={showSectionHeaders}
						compactMode={effectiveCompactMode}
						onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
						onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
						{...getSectionMoveProps(section.id)}
						{...getSectionDragProps(section.id)}
					/>
				);

			case "file-tree":
				return (
					<div key={section.id}>
						<FileList
							files={files}
							folders={folders}
							activeFileId={activeFileId}
							compactMode={effectiveCompactMode}
							sidebarWidth={sidebarWidth}
							showTreeGuides={showTreeGuides}
							isLoading={isFilesLoading}
							actions={fileTreeActions}
							queries={queries}
							onCreationParentChange={onCreationParentChange}
							onCreateNote={() => onCreateFile()}
							onCreateFolder={onCreateFolder}
							scrollElementRef={scrollContainerRef}
						/>
					</div>
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
						compactMode={effectiveCompactMode}
						onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
						onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
						onRename={(name) => sidebarStore.renameSection(section.id, name)}
						onDelete={() => sidebarStore.removeSection(section.id)}
						onSetColor={(color) =>
							sidebarStore.setCustomSectionColor(section.id, color)
						}
						onFileSelect={handleFileSelect}
						onFilePrefetch={onFilePrefetch}
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
				"min-w-0 overflow-hidden",
				className,
			)}
		>
			<div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
				<div
					className={cn(
						"relative flex h-11 items-center justify-between overflow-hidden",
						isNarrow ? "px-1.5" : "px-3",
					)}
				>
					<motion.div
						animate={
							isSearchOpen
								? { y: -8, opacity: 0, scale: 0.985 }
								: { y: 0, opacity: 1, scale: 1 }
						}
						transition={searchSwapTransition}
						className={cn(
							"flex h-full w-full min-w-0 items-center justify-between will-change-transform",
							isNarrow ? "gap-1" : "gap-3",
							isSearchOpen && "pointer-events-none",
						)}
						inert={isSearchOpen}
						aria-hidden={isSearchOpen}
					>
						<div
							className={cn(
								"flex min-w-0 items-center w-full justify-between",
								isNarrow ? "gap-0.5" : "gap-2 md:gap-2.5",
							)}
						>
							<HeaderActionTooltip label="New note" shortcutId="notes.newNote">
								<button
									onClick={() => onCreateFile()}
									className={cn(
										"inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										"focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground",
										isNarrow ? "h-6 w-6" : "h-7 w-7",
									)}
									aria-label="New note"
								>
									<NewNoteIcon />
								</button>
							</HeaderActionTooltip>
							<HeaderActionTooltip label="New folder" shortcutId="notes.newFolder">
								<button
									onClick={onCreateFolder}
									className={cn(
										"inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										"focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground",
										isNarrow ? "h-6 w-6" : "h-7 w-7",
									)}
									aria-label="New folder"
								>
									<NewFolderNoteIcon />
								</button>
							</HeaderActionTooltip>
							<HeaderActionTooltip label="Manage sections">
								<button
									onClick={openConfigPanel}
									className={cn(
										"inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										"focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground",
										isNarrow ? "h-6 w-6" : "h-7 w-7",
									)}
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
													const anyExpanded = folders.some(
														(f) => f.isOpen,
													);
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
											className={cn(
												"inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										"focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground",
												isNarrow ? "h-6 w-6" : "h-7 w-7",
											)}
											aria-label="Toggle all folders"
										>
											<UnfoldVertical className="h-4 w-4" strokeWidth={1.5} />
										</button>
									</HeaderActionTooltip>
								</div>
							)}
							{hasSearchSection && (
								<HeaderActionTooltip
									label="Search notes"
									shortcutId="notes.focusSidebarSearch"
								>
									<button
										onClick={openSearch}
										className={cn(
											"inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										"focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground",
											isNarrow ? "h-6 w-6" : "h-7 w-7",
										)}
										aria-label="Search notes"
									>
										<Search className="h-4 w-4" strokeWidth={1.5} />
									</button>
								</HeaderActionTooltip>
							)}
							{onOpenCommandPalette && (
								<HeaderActionTooltip
									label="Command menu"
									shortcutId="notes.commandPalette"
								>
									<button
										onClick={onOpenCommandPalette}
										className={cn(
											"inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										"focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground",
											isNarrow ? "h-6 w-6" : "h-7 w-7",
										)}
										aria-label="Command menu"
									>
										<Command className="h-4 w-4" strokeWidth={1.5} />
									</button>
								</HeaderActionTooltip>
							)}
							<SidebarConfigManager
								open={isConfigOpen}
								onOpenChange={setIsConfigOpen}
								hideTrigger
								sections={sidebarStore.config.sections}
								showSectionHeaders={sidebarStore.config.showSectionHeaders}
								compactMode={effectiveCompactMode}
								showTreeGuides={sidebarStore.config.showTreeGuides}
								onReorderSections={sidebarStore.reorderSections}
								onToggleSectionVisibility={sidebarStore.toggleSectionVisibility}
								onAddCustomSection={sidebarStore.addCustomSection}
								onRemoveSection={sidebarStore.removeSection}
								onRenameSection={sidebarStore.renameSection}
								onToggleShowSectionHeaders={sidebarStore.toggleShowSectionHeaders}
								onToggleCompactMode={sidebarStore.toggleCompactMode}
								onToggleTreeGuides={sidebarStore.toggleTreeGuides}
								onResetToDefaults={sidebarStore.resetToDefaults}
							/>
							{!isGuest && (
								// Desktop shows the bell at the avatar (icon rail); the rail is
								// hidden on mobile, so keep a mobile-only trigger here.
								<div className="md:hidden">
									<HeaderActionTooltip label="Notifications">
										<NotificationBell />
									</HeaderActionTooltip>
								</div>
							)}
						</div>

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

					<AnimatePresence>
						{hasSearchSection && isSearchOpen && (
							<motion.div
								ref={searchSwapRef}
								onBlur={handleSearchSwapBlur}
								initial={{ y: 8, opacity: 0, scale: 0.985 }}
								animate={{ y: 0, opacity: 1, scale: 1 }}
								exit={{ y: 8, opacity: 0, scale: 0.985 }}
								transition={searchSwapTransition}
								className="absolute inset-x-0 top-0 flex h-11 items-center px-3 will-change-transform"
							>
								<div className="flex h-8 w-full items-center gap-2 bg-transparent px-2.5">
									<Search
										className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
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
										aria-label="Search notes"
										className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60 focus-visible:shadow-none md:text-[13px]"
									/>
									<button
										onClick={closeSearch}
										className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground"
										title="Close search"
									>
										<X className="h-3.5 w-3.5" strokeWidth={1.5} />
									</button>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>

			<div
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-hidden",
					effectiveCompactMode && "text-sm",
					isVeryNarrow && "text-xs",
				)}
			>
				{searchQuery.trim() ? (
					<div
						ref={searchResultsRef}
						onBlur={handleSearchSwapBlur}
						className="flex-1 overflow-y-auto px-2 py-2"
					>
						{hasSearchResults ? (
							<div className="flex flex-col gap-3">
								{visibleSearchFolders.length > 0 && (
									<div className="flex flex-col gap-0.5">
										<p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Folders
										</p>
										{visibleSearchFolders.map((folder) => (
											<button
												key={folder.id}
												onMouseDown={(event) => event.preventDefault()}
												onClick={() => handleSearchFolderSelect(folder.id)}
												className="flex h-[34px] w-full items-center gap-1.5 border border-transparent px-2 text-left text-xs font-medium text-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground/88"
											>
												<Folder
													className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
													strokeWidth={1.5}
												/>
												<span className="truncate">{folder.name}</span>
											</button>
										))}
										{searchResults.folders.length >
											visibleSearchFolders.length && (
											<p className="px-2 pt-1 text-[10px] text-muted-foreground">
												+
												{searchResults.folders.length -
													visibleSearchFolders.length}{" "}
												more folders
											</p>
										)}
									</div>
								)}
								{visibleSearchFiles.length > 0 && (
									<div className="flex flex-col gap-0.5">
										<p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Files
										</p>
										{visibleSearchFiles.map(({ file, snippet }) => (
											<button
												key={file.id}
												onMouseDown={(event) => event.preventDefault()}
												onClick={() => handleSearchFileSelect(file.id)}
												className={cn(
													"flex min-h-[34px] w-full items-start gap-1.5 border border-transparent px-2 py-1.5 text-left text-xs font-medium transition-colors",
													file.id === activeFileId
														? "border-border bg-muted text-foreground"
														: "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88",
												)}
											>
												<FileText
													className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
													strokeWidth={1.5}
												/>
												<span className="flex min-w-0 flex-col">
													<span className="truncate">{file.name}</span>
													{snippet && (
														<span className="truncate text-[11px] font-normal text-muted-foreground">
															{snippet}
														</span>
													)}
												</span>
											</button>
										))}
										{searchResults.files.length > visibleSearchFiles.length && (
											<p className="px-2 pt-1 text-[10px] text-muted-foreground">
												+
												{searchResults.files.length -
													visibleSearchFiles.length}{" "}
												more files
											</p>
										)}
									</div>
								)}
							</div>
						) : supportsContentSearch && isSearching ? (
							<p className="px-2 py-6 text-center text-xs font-medium text-muted-foreground">
								Searching…
							</p>
						) : (
							<div className="px-2 py-6 text-center">
								<p className="text-xs font-medium text-foreground/70">
									{supportsContentSearch
										? "No results found"
										: "No matching titles"}
								</p>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{supportsContentSearch
										? "Try a note title, folder name, or a phrase from the editor content."
										: "Try a different note or folder name."}
								</p>
							</div>
						)}
					</div>
				) : (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<div className="flex min-h-0 flex-1 flex-col">
								<div
									ref={scrollContainerRef}
									className={cn(
										"min-h-0 flex-1 overflow-y-auto pt-2",
										effectiveCompactMode && "pt-1",
									)}
								>
									{fileTreeSection ? renderSection(fileTreeSection) : null}
								</div>
								<div className="shrink-0 border-t border-sidebar-border pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-0">
									{navigationSections.map(renderSection)}
									{!isGuest && (
										<SharedSection
											activeFileId={activeFileId}
											isCollapsed={sharedSectionCollapsed}
											showHeader={showSectionHeaders}
											compactMode={effectiveCompactMode}
											onToggleCollapse={() =>
												setSharedSectionCollapsed((p) => !p)
											}
											onFileSelect={handleFileSelect}
										/>
									)}
									{journalSection ? renderSection(journalSection) : null}
								</div>
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent className="w-48">
							<ContextMenuItem className="gap-2" onClick={() => onCreateFile()}>
								<FilePlus className="h-3.5 w-3.5" strokeWidth={1.6} />
								New note
								{newNoteHint && (
									<ContextMenuShortcut>{newNoteHint}</ContextMenuShortcut>
								)}
							</ContextMenuItem>
							<ContextMenuItem className="gap-2" onClick={onCreateFolder}>
								<FolderPlus className="h-3.5 w-3.5" strokeWidth={1.6} />
								New folder
								{newFolderHint && (
									<ContextMenuShortcut>{newFolderHint}</ContextMenuShortcut>
								)}
							</ContextMenuItem>
							{(onExpandAllFolders || onCollapseAllFolders) && (
								<>
									<ContextMenuSeparator />
									{onExpandAllFolders && (
										<ContextMenuItem
											className="gap-2"
											onClick={onExpandAllFolders}
										>
											<UnfoldVertical
												className="h-3.5 w-3.5"
												strokeWidth={1.6}
											/>
											Expand all folders
										</ContextMenuItem>
									)}
									{onCollapseAllFolders && (
										<ContextMenuItem
											className="gap-2"
											onClick={onCollapseAllFolders}
										>
											<FoldVertical
												className="h-3.5 w-3.5"
												strokeWidth={1.6}
											/>
											Collapse all folders
										</ContextMenuItem>
									)}
								</>
							)}
						</ContextMenuContent>
					</ContextMenu>
				)}
			</div>
		</div>
	);
});
