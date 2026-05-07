"use client";

import { useState } from "react";
import { ChevronRight, FileText, Folder, Plus, Pencil, Trash2, Palette } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import { PROJECT_COLORS } from "./types";
import type { Project } from "./types";
import { SidebarSection } from "./sidebar-section";
import { EmptyState } from "@/shared/ui/empty-state";
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
  onCreateProject: (name: string, color?: string) => void;
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void;
  onDeleteProject: (projectId: string) => void;
  onRemoveFromProject: (projectId: string, itemId: string, itemType: "file" | "folder") => void;
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
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onRemoveFromProject,
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

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      onCreateProject(newProjectName.trim());
      setNewProjectName("");
      setIsCreating(false);
    }
  };

  const handleRenameProject = (projectId: string) => {
    if (editingName.trim()) {
      onUpdateProject(projectId, { name: editingName.trim() });
    }
    setEditingProjectId(null);
    setEditingName("");
  };

  const getProjectItems = (project: Project) => {
    const projectFiles = files.filter((f) => project.fileIds.includes(f.id));
    const projectFolders = folders.filter((f) => project.folderIds.includes(f.id));
    return { projectFiles, projectFolders };
  };

  const addButton = (
    <button
      onClick={() => setIsCreating(true)}
      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
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
              "w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-xs outline-none focus:border-white/20",
              compactMode ? "py-1" : "py-1.5",
            )}
            autoFocus
          />
        </div>
      )}

      {projects.length === 0 && !isCreating ? (
        <EmptyState
          variant="projects"
          className={cn("px-2", compactMode ? "py-1.5" : "py-2")}
        />
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
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-white/[0.045]",
                        compactMode ? "h-6" : "h-7",
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "w-3 h-3 text-muted-foreground transition-transform shrink-0",
                          isExpanded && "rotate-90",
                        )}
                        strokeWidth={1.5}
                      />
                      <span className={cn("w-2 h-2 rounded-full shrink-0", project.color)} />
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleRenameProject(project.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameProject(project.id);
                            if (e.key === "Escape") {
                              setEditingProjectId(null);
                              setEditingName("");
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "flex-1 border-b border-foreground/30 bg-transparent text-xs outline-none",
                            compactMode && "py-0.5",
                          )}
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 truncate text-foreground/70">{project.name}</span>
                      )}
                      <span className="ml-1 w-4 shrink-0 text-right text-[10px] text-muted-foreground/50 tabular-nums">
                        {totalItems}
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
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
                            onClick={() => onUpdateProject(project.id, { color: color.value })}
                            className="gap-2"
                          >
                            <span className={cn("w-3 h-3 rounded-full", color.value)} />
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
                  <div className={cn("ml-5 space-y-px", compactMode && "space-y-[1px]")}>
                    {projectFolders.map((folder) => (
                      <ContextMenu key={folder.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            className={cn(
                              "group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground/60 transition-colors hover:bg-white/[0.045]",
                              compactMode ? "h-6" : "h-7",
                            )}
                          >
                            <Folder
                              className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span className="flex-1 truncate">{folder.name}</span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-40">
                          <ContextMenuItem
                            onClick={() => onRemoveFromProject(project.id, folder.id, "folder")}
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
                            className={cn(
                              "group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                              compactMode ? "h-6" : "h-7",
                              file.id === activeFileId
                                ? "bg-white/[0.07] text-foreground"
                                : "text-foreground/60 hover:bg-white/[0.045]",
                            )}
                          >
                            <FileText
                              className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span className="flex-1 truncate">{file.name}</span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-40">
                          <ContextMenuItem
                            onClick={() => onRemoveFromProject(project.id, file.id, "file")}
                            className="gap-2"
                          >
                            Remove from project
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                    {totalItems === 0 && (
                      <p className="px-2 py-1 text-[11px] text-muted-foreground/50">
                        Right-click files to add
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SidebarSection>
  );
}
