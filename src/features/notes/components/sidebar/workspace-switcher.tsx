"use client";

import { useState } from "react";
import { Check, ChevronDown, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useWorkspaceStore, WORKSPACE_COLORS } from "@/modules/workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/shared/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/shared/ui/context-menu";

export function WorkspaceSwitcher() {
  const {
    getWorkspaces,
    getActiveWorkspace,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  } = useWorkspaceStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const workspaces = getWorkspaces();
  const activeWorkspace = getActiveWorkspace();

  const handleCreateWorkspace = () => {
    if (!newWorkspaceName.trim()) {
      setIsCreating(false);
      return;
    }
    createWorkspace(newWorkspaceName.trim());
    setNewWorkspaceName("");
    setIsCreating(false);
  };

  const handleRenameWorkspace = (workspaceId: string) => {
    if (!editingName.trim()) {
      setEditingWorkspaceId(null);
      setEditingName("");
      return;
    }
    updateWorkspace(workspaceId, { name: editingName.trim() });
    setEditingWorkspaceId(null);
    setEditingName("");
  };

  const startEditing = (workspaceId: string, currentName: string) => {
    setEditingWorkspaceId(workspaceId);
    setEditingName(currentName);
  };

  const handleDeleteWorkspace = (workspaceId: string) => {
    deleteWorkspace(workspaceId);
  };

  const handleChangeColor = (workspaceId: string, color: string) => {
    updateWorkspace(workspaceId, { color });
  };

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-white/[0.045] focus:outline-none">
          {/* Color indicator */}
          <span
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", activeWorkspace?.color || "bg-blue-500")}
          />
          {/* Workspace name */}
          <span className="flex-1 truncate text-sm font-medium text-foreground/90">
            {activeWorkspace?.name || "Select Workspace"}
          </span>
          {/* Chevron */}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200",
              dropdownOpen && "rotate-180"
            )}
            strokeWidth={1.5}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px]"
      >
        {/* Workspace list */}
        <div className="max-h-[280px] overflow-y-auto">
          {workspaces.map((workspace) => {
            const isActive = workspace.id === activeWorkspace?.id;
            const isEditing = editingWorkspaceId === workspace.id;

            return (
              <ContextMenu key={workspace.id}>
                <ContextMenuTrigger asChild>
                  <div>
                    {isEditing ? (
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleRenameWorkspace(workspace.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameWorkspace(workspace.id);
                            if (e.key === "Escape") {
                              setEditingWorkspaceId(null);
                              setEditingName("");
                            }
                          }}
                          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-sm outline-none focus:border-white/20"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          setActiveWorkspace(workspace.id);
                          setDropdownOpen(false);
                        }}
                        className="flex items-center gap-2.5 px-2 py-1.5"
                      >
                        <span
                          className={cn("h-2 w-2 shrink-0 rounded-full", workspace.color)}
                        />
                        <span className="flex-1 truncate">{workspace.name}</span>
                        {isActive && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2} />
                        )}
                      </DropdownMenuItem>
                    )}
                  </div>
                </ContextMenuTrigger>

                {/* Context menu for workspace actions */}
                <ContextMenuContent className="w-48">
                  <ContextMenuItem
                    onClick={() => startEditing(workspace.id, workspace.name)}
                    className="gap-2"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2">
                      <Palette className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Change color
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-36">
                      {WORKSPACE_COLORS.map((color) => (
                        <ContextMenuItem
                          key={color.value}
                          onClick={() => handleChangeColor(workspace.id, color.value)}
                          className="gap-2"
                        >
                          <span className={cn("h-3 w-3 rounded-full", color.value)} />
                          {color.name}
                          {workspace.color === color.value && (
                            <Check className="ml-auto h-3.5 w-3.5" strokeWidth={2} />
                          )}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {workspaces.length > 1 && (
                    <ContextMenuItem
                      onClick={() => handleDeleteWorkspace(workspace.id)}
                      className="gap-2 text-red-400 focus:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Delete
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        {/* Create workspace */}
        {isCreating ? (
          <div className="px-2 py-1.5">
            <input
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onBlur={() => {
                if (!newWorkspaceName.trim()) setIsCreating(false);
                else handleCreateWorkspace();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateWorkspace();
                if (e.key === "Escape") {
                  setIsCreating(false);
                  setNewWorkspaceName("");
                }
              }}
              placeholder="Workspace name..."
              className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-sm outline-none focus:border-white/20"
              autoFocus
            />
          </div>
        ) : (
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setIsCreating(true);
            }}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Create workspace
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
