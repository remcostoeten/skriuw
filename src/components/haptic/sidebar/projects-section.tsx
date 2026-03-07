'use client';

import { useState } from 'react';
import { ChevronRight, FileText, Folder, Plus, MoreHorizontal, Pencil, Trash2, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoteFile, NoteFolder } from '@/types/notes';
import { Project, PROJECT_COLORS } from '@/modules/sidebar';
import { SidebarSection } from './sidebar-section';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/shared/ui/context-menu';

type Props = {
  projects: Project[];
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onFileSelect: (id: string) => void;
  onCreateProject: (name: string, color?: string) => void;
  onUpdateProject: (projectId: string, updates: Partial<Project>) => void;
  onDeleteProject: (projectId: string) => void;
  onRemoveFromProject: (projectId: string, itemId: string, itemType: 'file' | 'folder') => void;
};

export function ProjectsSection({
  projects,
  files,
  folders,
  activeFileId,
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
  onFileSelect,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onRemoveFromProject,
}: Props) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
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
      setNewProjectName('');
      setIsCreating(false);
    }
  };

  const handleRenameProject = (projectId: string) => {
    if (editingName.trim()) {
      onUpdateProject(projectId, { name: editingName.trim() });
    }
    setEditingProjectId(null);
    setEditingName('');
  };

  const getProjectItems = (project: Project) => {
    const projectFiles = files.filter(f => project.fileIds.includes(f.id));
    const projectFolders = folders.filter(f => project.folderIds.includes(f.id));
    return { projectFiles, projectFolders };
  };

  const addButton = (
    <button
      onClick={() => setIsCreating(true)}
      className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
      itemCount={projects.length}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
      actions={addButton}
    >
      {/* Create new project input */}
      {isCreating && (
        <div className="px-3 py-1.5">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onBlur={() => {
              if (!newProjectName.trim()) setIsCreating(false);
              else handleCreateProject();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewProjectName('');
              }
            }}
            placeholder="Project name..."
            className="w-full bg-accent/50 rounded px-2 py-1 text-[13px] outline-none border border-border focus:border-ring"
            autoFocus
          />
        </div>
      )}

      {projects.length === 0 && !isCreating ? (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground/60 text-center">
            No projects yet. Create one to organize your notes.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
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
                      className="group w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/50"
                    >
                      <ChevronRight 
                        className={cn(
                          "w-3 h-3 text-muted-foreground transition-transform shrink-0",
                          isExpanded && "rotate-90"
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
                            if (e.key === 'Enter') handleRenameProject(project.id);
                            if (e.key === 'Escape') {
                              setEditingProjectId(null);
                              setEditingName('');
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-transparent text-[13px] outline-none border-b border-foreground/30"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 text-[13px] text-foreground/80 truncate">
                          {project.name}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">
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
                  <div className="ml-4">
                    {projectFolders.map((folder) => (
                      <ContextMenu key={folder.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            className="group w-full flex items-center gap-2 px-3 py-1 text-left transition-colors text-foreground/70 hover:bg-accent/50"
                          >
                            <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                            <span className="flex-1 text-[13px] truncate">{folder.name}</span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-40">
                          <ContextMenuItem
                            onClick={() => onRemoveFromProject(project.id, folder.id, 'folder')}
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
                              "group w-full flex items-center gap-2 px-3 py-1 text-left transition-colors",
                              file.id === activeFileId
                                ? "bg-accent text-foreground"
                                : "text-foreground/70 hover:bg-accent/50"
                            )}
                          >
                            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                            <span className="flex-1 text-[13px] truncate">{file.name}</span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-40">
                          <ContextMenuItem
                            onClick={() => onRemoveFromProject(project.id, file.id, 'file')}
                            className="gap-2"
                          >
                            Remove from project
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                    {totalItems === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground/60">
                        Drag files here to add them
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
