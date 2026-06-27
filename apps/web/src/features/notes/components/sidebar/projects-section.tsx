"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Palette, FilePlus } from "lucide-react";
import { ChevronRightIcon } from "@/shared/icons/chevron-right";
import { FileTextIcon } from "@/shared/icons/file-text";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { cn } from "@/shared/lib/utils";
import { noop } from "@/shared/lib/noop";
import { NoteFile, NoteFolder } from "@/types/notes";
import { PROJECT_COLORS, resolveProjectColorClass } from "./types";
import type { Project } from "./types";
import { SidebarSection } from "./sidebar-section";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/shared/ui/context-menu";

const TREE_ITEM_MIME = "application/x-skriuw-tree-item";

type Props = {
	projects: Project[];
	files: NoteFile[];
	folders: NoteFolder[];
	activeFileId: string;
	isCollapsed: boolean;
	showHeader?: boolean;
	compactMode?: boolean;
	onToggleCollapse: () => void;
	onToggleVisibility: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
	onManageSections: () => void;
	onFileSelect: (id: string) => void;
	onFilePrefetch?: (id: string) => void;
	onCreateProject: (name: string, color?: string) => void;
	onUpdateProject: (projectId: string, updates: Partial<Project>) => void;
	onDeleteProject: (projectId: string) => void;
	onRemoveFromProject: (projectId: string, itemId: string, itemType: "file" | "folder") => void;
	onAddToProject?: (projectId: string, itemId: string, itemType: "file" | "folder") => void;
	onCreateNoteInProject?: (projectId: string) => void;
	isDraggable?: boolean;
	isDragging?: boolean;
	isDropTarget?: boolean;
	onDragStart?: (event: React.DragEvent) => void;
	onDragOver?: (event: React.DragEvent) => void;
	onDrop?: (event: React.DragEvent) => void;
	onDragEnd?: () => void;
};

export function ProjectsSection({
	projects,
	files,
	folders,
	activeFileId,
	isCollapsed,
	showHeader = true,
	compactMode = false,
	onToggleCollapse,
	onToggleVisibility,
	onMoveUp,
	onMoveDown,
	canMoveUp,
	canMoveDown,
	onFileSelect,
	onFilePrefetch,
	onCreateProject,
	onUpdateProject,
	onDeleteProject,
	onRemoveFromProject,
	onAddToProject,
	onCreateNoteInProject,
	isDraggable,
	isDragging,
	isDropTarget,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}: Props) {
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
	const [isCreating, setIsCreating] = useState(false);
	const [newProjectName, setNewProjectName] = useState("");
	const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
	const filesById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
	const foldersById = useMemo(
		() => new Map(folders.map((folder) => [folder.id, folder])),
		[folders],
	);

	function toggleProject(projectId: string) {
		setExpandedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	}

	function handleCreateProject() {
		if (newProjectName.trim()) {
			onCreateProject(newProjectName.trim());
			setNewProjectName("");
			setIsCreating(false);
		}
	}

	function expandProject(projectId: string) {
		setExpandedProjects((prev) => new Set(prev).add(projectId));
	}

	function handleCreateNote(projectId: string) {
		onCreateNoteInProject?.(projectId);
		expandProject(projectId);
	}

	function hasTreeItem(event: React.DragEvent) {
		return event.dataTransfer.types.includes(TREE_ITEM_MIME);
	}

	function handleProjectDragOver(event: React.DragEvent, projectId: string) {
		if (!onAddToProject || !hasTreeItem(event)) return;
		event.preventDefault();
		// file-list sets effectAllowed = "move"; matching it keeps the drop valid.
		event.dataTransfer.dropEffect = "move";
		setDragOverProjectId(projectId);
	}

	function handleProjectDrop(event: React.DragEvent, projectId: string) {
		setDragOverProjectId(null);
		if (!onAddToProject) return;
		const raw = event.dataTransfer.getData(TREE_ITEM_MIME);
		if (!raw) return;
		event.preventDefault();
		try {
			const item = JSON.parse(raw) as { id: string; type: "file" | "folder" };
			if (item?.id && (item.type === "file" || item.type === "folder")) {
				onAddToProject(projectId, item.id, item.type);
				expandProject(projectId);
			}
		} catch {
			noop();
		}
	}

	function handleRenameProject(projectId: string) {
		if (editingName.trim()) {
			onUpdateProject(projectId, { name: editingName.trim() });
		}
		setEditingProjectId(null);
		setEditingName("");
	}

	function getProjectItems(project: Project) {
		const projectFiles = project.fileIds.flatMap((id) => {
			const file = filesById.get(id);
			return file ? [file] : [];
		});
		const projectFolders = project.folderIds.flatMap((id) => {
			const folder = foldersById.get(id);
			return folder ? [folder] : [];
		});
		return { projectFiles, projectFolders };
	}

	const addButton = (
		<button
			onClick={() => setIsCreating(true)}
			className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
			title="Create project"
		>
			<Plus className="w-3 h-3" strokeWidth={1.5} />
		</button>
	);

	return (
		<SidebarSection
			id="projects"
			title="Projects"
			isCollapsed={isCollapsed}
			showHeader={showHeader}
			compactMode={compactMode}
			itemCount={projects.length}
			onToggleCollapse={onToggleCollapse}
			onToggleVisibility={onToggleVisibility}
			onMoveUp={onMoveUp}
			onMoveDown={onMoveDown}
			canMoveUp={canMoveUp}
			canMoveDown={canMoveDown}
			actions={addButton}
			isDraggable={isDraggable}
			isDragging={isDragging}
			isDropTarget={isDropTarget}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div className="min-h-[2.5rem]">
			{/* Create new project input */}
			{isCreating && (
				<div className={cn("px-2", compactMode ? "py-0.5" : "py-1")}>
					<input
						type="text"
						value={newProjectName}
						onChange={(e) => setNewProjectName(e.target.value)}
						onBlur={() => {
							if (!newProjectName.trim()) setIsCreating(false);
							else handleCreateProject();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreateProject();
							if (e.key === "Escape") {
								setIsCreating(false);
								setNewProjectName("");
							}
						}}
						placeholder="Project name..."
						className={cn(
							"w-full rounded-md border border-foreground/10 bg-foreground/[0.03] px-2.5 text-base outline-none focus:border-foreground/20 md:text-xs",
							compactMode ? "py-1.5 md:py-1" : "py-2 md:py-1.5",
						)}
						autoFocus
					/>
				</div>
			)}

			{projects.length === 0 && !isCreating ? (
				<button
					type="button"
					onClick={() => setIsCreating(true)}
					className={cn(
						"group mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md border border-dashed border-border/70 px-2 text-left text-xs text-muted-foreground/70 transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground",
						compactMode ? "h-7" : "h-8",
					)}
				>
					<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border/70 text-muted-foreground/60 transition-colors group-hover:text-foreground">
						<Plus className="h-3 w-3" strokeWidth={1.5} />
					</span>
					<span className="min-w-0 flex-1 truncate">No projects</span>
					<span className="shrink-0 text-[10px] font-medium text-muted-foreground/55 transition-colors group-hover:text-foreground/75">
						Add one
					</span>
				</button>
			) : (
				<div className={cn("space-y-px px-1", compactMode && "space-y-[1px]")}>
					{projects.map((project) => {
						const { projectFiles, projectFolders } = getProjectItems(project);
						const isExpanded = expandedProjects.has(project.id);
						const isEditing = editingProjectId === project.id;
						const totalItems = projectFiles.length + projectFolders.length;

						return (
							<div key={project.id}>
								<ContextMenu>
									<ContextMenuTrigger asChild>
										<button
											onClick={() => toggleProject(project.id)}
											onContextMenu={(e) => e.stopPropagation()}
											onDragOver={(e) => handleProjectDragOver(e, project.id)}
											onDragLeave={() =>
												setDragOverProjectId((current) =>
													current === project.id ? null : current,
												)
											}
											onDrop={(e) => handleProjectDrop(e, project.id)}
											className={cn(
												"group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-foreground/[0.045]",
												compactMode ? "h-6" : "h-7",
												dragOverProjectId === project.id &&
													"bg-foreground/[0.07] ring-1 ring-inset ring-foreground/20",
											)}
										>
											<ChevronRightIcon
												size={12}
												className={cn(
													"text-muted-foreground transition-transform shrink-0",
													isExpanded && "rotate-90",
												)}
											/>
											<span
												className={cn(
													"w-2 h-2 rounded-full shrink-0",
													resolveProjectColorClass(project.color),
												)}
											/>
											{isEditing ? (
												<input
													type="text"
													value={editingName}
													onChange={(e) => setEditingName(e.target.value)}
													onBlur={() => handleRenameProject(project.id)}
													onKeyDown={(e) => {
														if (e.key === "Enter")
															handleRenameProject(project.id);
														if (e.key === "Escape") {
															setEditingProjectId(null);
															setEditingName("");
														}
													}}
													onClick={(e) => e.stopPropagation()}
													className={cn(
														"flex-1 border-b border-foreground/30 bg-transparent text-base outline-none md:text-xs",
														compactMode && "py-0.5",
													)}
													autoFocus
												/>
											) : (
												<span className="flex-1 truncate text-foreground/70">
													{project.name}
												</span>
											)}
											<span className="ml-1 w-4 shrink-0 text-right text-[10px] text-muted-foreground/50 tabular-nums">
												{totalItems}
											</span>
										</button>
									</ContextMenuTrigger>
									<ContextMenuContent className="w-48">
										<ContextMenuItem
											onClick={() => handleCreateNote(project.id)}
											className="gap-2"
										>
											<FilePlus className="w-4 h-4" />
											New note
										</ContextMenuItem>
										<ContextMenuSeparator />
										<ContextMenuItem
											onClick={() => {
												setEditingProjectId(project.id);
												setEditingName(project.name);
											}}
											className="gap-2"
										>
											<Pencil className="w-4 h-4" />
											Rename
										</ContextMenuItem>
										<ContextMenuSub>
											<ContextMenuSubTrigger className="gap-2">
												<Palette className="w-4 h-4" />
												Change color
											</ContextMenuSubTrigger>
											<ContextMenuSubContent className="w-36">
												{PROJECT_COLORS.map((color) => (
													<ContextMenuItem
														key={color.value}
														onClick={() =>
															onUpdateProject(project.id, {
																color: color.value,
															})
														}
														className="gap-2"
													>
														<span
															className={cn(
																"w-3 h-3 rounded-full",
																color.value,
															)}
														/>
														{color.name}
													</ContextMenuItem>
												))}
											</ContextMenuSubContent>
										</ContextMenuSub>
										<ContextMenuSeparator />
										<ContextMenuItem
											onClick={() => onDeleteProject(project.id)}
											className="gap-2 text-destructive focus:text-destructive"
										>
											<Trash2 className="w-4 h-4" />
											Delete project
										</ContextMenuItem>
									</ContextMenuContent>
								</ContextMenu>

								{/* Project items */}
								{isExpanded && (
									<div
										className={cn(
											"ml-5 space-y-px",
											compactMode && "space-y-[1px]",
										)}
									>
										{projectFolders.map((folder) => (
											<ContextMenu key={folder.id}>
												<ContextMenuTrigger asChild>
													<button
														onContextMenu={(e) => e.stopPropagation()}
														className={cn(
															"group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground/60 transition-colors hover:bg-foreground/[0.045]",
															compactMode ? "h-6" : "h-7",
														)}
													>
														<FolderOpenIcon
															size={14}
															className="shrink-0 text-muted-foreground/70"
														/>
														<span className="flex-1 truncate">
															{folder.name}
														</span>
													</button>
												</ContextMenuTrigger>
												<ContextMenuContent className="w-40">
													<ContextMenuItem
														onClick={() =>
															onRemoveFromProject(
																project.id,
																folder.id,
																"folder",
															)
														}
														className="gap-2"
													>
														Remove from project
													</ContextMenuItem>
												</ContextMenuContent>
											</ContextMenu>
										))}
										{projectFiles.map((file) => (
											<ContextMenu key={file.id}>
												<ContextMenuTrigger asChild>
													<button
														onClick={() => onFileSelect(file.id)}
														onContextMenu={(e) => e.stopPropagation()}
														onPointerEnter={() =>
															onFilePrefetch?.(file.id)
														}
														className={cn(
															"group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
															compactMode ? "h-6" : "h-7",
															file.id === activeFileId
																? "bg-foreground/[0.07] text-foreground"
																: "text-foreground/60 hover:bg-foreground/[0.045]",
														)}
													>
														<FileTextIcon
															size={14}
															className="shrink-0 text-muted-foreground/70"
														/>
														<span className="flex-1 truncate">
															{file.name}
														</span>
													</button>
												</ContextMenuTrigger>
												<ContextMenuContent className="w-40">
													<ContextMenuItem
														onClick={() =>
															onRemoveFromProject(
																project.id,
																file.id,
																"file",
															)
														}
														className="gap-2"
													>
														Remove from project
													</ContextMenuItem>
												</ContextMenuContent>
											</ContextMenu>
										))}
										{totalItems === 0 && (
											<p className="px-2 py-1 text-[11px] text-muted-foreground/50">
												Drag files here, or right-click to add a note
											</p>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				{projects.length > 0 &&
					(projects.length === 1 ? (
						<ContextMenuItem
							onClick={() => handleCreateNote(projects[0].id)}
							className="gap-2"
						>
							<FilePlus className="w-4 h-4" />
							New note in {projects[0].name}
						</ContextMenuItem>
					) : (
						<ContextMenuSub>
							<ContextMenuSubTrigger className="gap-2">
								<FilePlus className="w-4 h-4" />
								New note in…
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-44">
								{projects.map((project) => (
									<ContextMenuItem
										key={project.id}
										onClick={() => handleCreateNote(project.id)}
										className="gap-2"
									>
										<span
											className={cn(
												"w-2.5 h-2.5 rounded-full shrink-0",
												resolveProjectColorClass(project.color),
											)}
										/>
										{project.name}
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
					))}
				<ContextMenuItem onClick={() => setIsCreating(true)} className="gap-2">
					<Plus className="w-4 h-4" />
					New project
				</ContextMenuItem>
			</ContextMenuContent>
			</ContextMenu>
		</SidebarSection>
	);
}
