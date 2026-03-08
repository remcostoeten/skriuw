"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import {
  Briefcase,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
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
import { useSidebarStore } from "@/modules/sidebar";

interface FileListProps {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onRenameFile: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveFile: (fileId: string, newParentId: string | null) => void;
  onMoveFolder: (folderId: string, newParentId: string | null) => void;
  getFilesInFolder: (parentId: string | null) => NoteFile[];
  getFoldersInFolder: (parentId: string | null) => NoteFolder[];
  countDescendants: (folderId: string) => number;
  onReorderFiles?: (fileId: string, targetIndex: number, parentId: string | null) => void;
  onReorderFolders?: (folderId: string, targetIndex: number, parentId: string | null) => void;
}

type SelectedItem = {
  id: string;
  type: "file" | "folder";
  parentId: string | null;
};

type DragItem = {
  type: "file" | "folder";
  id: string;
  parentId: string | null;
};

export function FileList({
  folders,
  files,
  activeFileId,
  onFileSelect,
  onToggleFolder,
  onRenameFile,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  getFilesInFolder,
  getFoldersInFolder,
  countDescendants,
}: FileListProps) {
  // Sidebar store for favorites, projects, and custom sections
  const {
    config,
    isFavorite,
    addToFavorites,
    removeFromFavorites,
    getProjects,
    addToProject,
    addToCustomSection,
  } = useSidebarStore();
  const projects = getProjects();
  const customSections = config.sections.filter((section) => section.type === "custom");

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const lastSelectedIndexRef = useRef<number | null>(null);

  const flattenedVisibleItems = useMemo<SelectedItem[]>(() => {
    const list: SelectedItem[] = [];

    const visit = (parentId: string | null) => {
      const folderChildren = getFoldersInFolder(parentId);
      folderChildren.forEach((folder) => {
        list.push({ id: folder.id, type: "folder", parentId: folder.parentId });
        if (folder.isOpen) {
          visit(folder.id);
        }
      });
      const fileChildren = getFilesInFolder(parentId);
      fileChildren.forEach((file) => {
        list.push({ id: file.id, type: "file", parentId: file.parentId });
      });
    };

    visit(null);
    return list;
  }, [files, folders, getFilesInFolder, getFoldersInFolder]);

  const getDescendantIds = useCallback(
    function collect(folderId: string): string[] {
      const children = getFoldersInFolder(folderId);
      return [folderId, ...children.flatMap((child) => collect(child.id))];
    },
    [getFoldersInFolder],
  );

  const isItemSelected = useCallback(
    (item: SelectedItem) =>
      selectedItems.some((selection) => selection.id === item.id && selection.type === item.type),
    [selectedItems],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState<"file" | "folder">("file");
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string | null;
    type: "folder" | "root";
  } | null>(null);

  // Focus and select text when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = useCallback((id: string, currentName: string, type: "file" | "folder") => {
    setEditingId(id);
    setEditingName(type === "file" ? currentName.replace(".md", "") : currentName);
    setEditingType(type);
  }, []);

  const finishRename = useCallback(() => {
    if (editingId && editingName.trim()) {
      if (editingType === "file") {
        onRenameFile(editingId, editingName.trim());
      } else {
        onRenameFolder(editingId, editingName.trim());
      }
    }
    setEditingId(null);
    setEditingName("");
  }, [editingId, editingName, editingType, onRenameFile, onRenameFolder]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishRename();
      } else if (e.key === "Escape") {
        setEditingId(null);
        setEditingName("");
      }
    },
    [finishRename],
  );

  // Double-click handler for inline rename
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string, name: string, type: "file" | "folder") => {
      e.preventDefault();
      e.stopPropagation();
      if (
        selectedItems.length > 1 &&
        selectedItems.some((selection) => selection.id === id && selection.type === type)
      ) {
        return;
      }
      startRename(id, name, type);
    },
    [selectedItems, startRename],
  );

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    setDragItem(item);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(item));
    // Add a slight delay to allow the drag image to render
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = "0.5";
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    setDragItem(null);
    setDropTarget(null);
  }, []);

  const getSelectionForAction = useCallback(
    (item: SelectedItem) => {
      const alreadySelected = selectedItems.some(
        (selection) => selection.id === item.id && selection.type === item.type,
      );
      const base = alreadySelected ? selectedItems : [...selectedItems, item];
      const deduped: SelectedItem[] = [];
      const seen = new Set<string>();
      base.forEach((selection) => {
        const key = `${selection.type}:${selection.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(selection);
        }
      });
      return deduped.length ? deduped : [item];
    },
    [selectedItems],
  );

  const deleteSelection = useCallback(
    (items: SelectedItem[]) => {
      items.forEach((item) => {
        if (item.type === "file") {
          onDeleteFile(item.id);
        } else {
          onDeleteFolder(item.id);
        }
      });
      setSelectedItems([]);
    },
    [onDeleteFile, onDeleteFolder, setSelectedItems],
  );

  const moveSelected = useCallback(
    (items: SelectedItem[], targetParentId: string | null) => {
      items.forEach((item) => {
        if (item.type === "file") {
          onMoveFile(item.id, targetParentId);
        } else {
          if (targetParentId && getDescendantIds(item.id).includes(targetParentId)) {
            return;
          }
          onMoveFolder(item.id, targetParentId);
        }
      });
      setSelectedItems([]);
    },
    [onMoveFile, onMoveFolder, getDescendantIds, setSelectedItems],
  );

  const handleItemClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, item: SelectedItem, action: () => void) => {
      const metaKey = event.metaKey || event.ctrlKey;
      const shiftKey = event.shiftKey;
      const itemIndex = flattenedVisibleItems.findIndex(
        (entry) => entry.id === item.id && entry.type === item.type,
      );

      if (shiftKey && lastSelectedIndexRef.current !== null && itemIndex !== -1) {
        const start = Math.min(lastSelectedIndexRef.current, itemIndex);
        const end = Math.max(lastSelectedIndexRef.current, itemIndex);
        const range = flattenedVisibleItems.slice(start, end + 1);
        setSelectedItems(range);
        lastSelectedIndexRef.current = itemIndex;
        event.preventDefault();
        return;
      }

      if (metaKey) {
        setSelectedItems((prev) => {
          const exists = prev.some(
            (selection) => selection.id === item.id && selection.type === item.type,
          );
          if (exists) {
            return prev.filter(
              (selection) => !(selection.id === item.id && selection.type === item.type),
            );
          }
          return [...prev, item];
        });
        lastSelectedIndexRef.current = itemIndex;
        event.preventDefault();
        return;
      }

      setSelectedItems([item]);
      lastSelectedIndexRef.current = itemIndex;
      action();
    },
    [flattenedVisibleItems, setSelectedItems],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, item: SelectedItem) => {
      if (!isItemSelected(item)) {
        setSelectedItems([item]);
        const index = flattenedVisibleItems.findIndex(
          (entry) => entry.id === item.id && entry.type === item.type,
        );
        lastSelectedIndexRef.current = index !== -1 ? index : null;
      }
    },
    [flattenedVisibleItems, isItemSelected, setSelectedItems],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string | null, targetType: "folder" | "root") => {
      e.preventDefault();
      e.stopPropagation();

      if (!dragItem) return;

      // Prevent dropping a folder into itself or its descendants
      if (dragItem.type === "folder" && targetType === "folder") {
        const descendants = getDescendantIds(dragItem.id);
        if (targetId && descendants.includes(targetId)) {
          e.dataTransfer.dropEffect = "none";
          return;
        }
      }

      e.dataTransfer.dropEffect = "move";
      setDropTarget({ id: targetId, type: targetType });
    },
    [dragItem, folders],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're leaving to outside the list
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string | null) => {
      e.preventDefault();
      e.stopPropagation();

      if (!dragItem) return;

      // Don't drop on itself
      if (dragItem.id === targetId) {
        setDragItem(null);
        setDropTarget(null);
        return;
      }

      // Prevent dropping folder into its descendants
      if (dragItem.type === "folder" && targetId) {
        if (getDescendantIds(dragItem.id).includes(targetId)) {
          setDragItem(null);
          setDropTarget(null);
          return;
        }
      }

      if (dragItem.type === "file") {
        onMoveFile(dragItem.id, targetId);
      } else {
        onMoveFolder(dragItem.id, targetId);
      }

      setDragItem(null);
      setDropTarget(null);
    },
    [dragItem, folders, onMoveFile, onMoveFolder],
  );

  // Get all folders for "Move to" submenu
  const renderMoveToSubmenu = useCallback(
    (items: SelectedItem[]) => {
      const selectionFolders = items.filter((item) => item.type === "folder");
      const invalidFolderIds = new Set<string>();
      selectionFolders.forEach((folderItem) => {
        getDescendantIds(folderItem.id).forEach((descendantId) =>
          invalidFolderIds.add(descendantId),
        );
      });

      const availableFolders = folders.filter((folder) => !invalidFolderIds.has(folder.id));
      const hasSelectionAtNonRoot = items.some((item) => item.parentId !== null);

      return (
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <FolderInput className="w-4 h-4" />
            Move to
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {hasSelectionAtNonRoot && (
              <ContextMenuItem onClick={() => moveSelected(items, null)}>Root</ContextMenuItem>
            )}
            {availableFolders.length > 0
              ? availableFolders.map((folder) => (
                  <ContextMenuItem key={folder.id} onClick={() => moveSelected(items, folder.id)}>
                    {folder.name}
                  </ContextMenuItem>
                ))
              : !hasSelectionAtNonRoot && (
                  <ContextMenuItem disabled>No folders available</ContextMenuItem>
                )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    },
    [folders, getDescendantIds, moveSelected],
  );

  const renderFolder = (folder: NoteFolder, depth: number = 0) => {
    const childFolders = getFoldersInFolder(folder.id);
    const childFiles = getFilesInFolder(folder.id);
    const totalCount = countDescendants(folder.id);
    const isEditing = editingId === folder.id;
    const isDragging = dragItem?.id === folder.id;
    const isDropTarget = dropTarget?.id === folder.id;
    const folderItem: SelectedItem = { id: folder.id, type: "folder", parentId: folder.parentId };
    const selectionForAction = getSelectionForAction(folderItem);
    const selectionHasMultiple = selectionForAction.length > 1;
    const isSelected = isItemSelected(folderItem);

    return (
      <div key={folder.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={(event) =>
                handleItemClick(event, folderItem, () => {
                  if (!isEditing) {
                    onToggleFolder(folder.id);
                  }
                })
              }
              onDoubleClick={(e) => handleDoubleClick(e, folder.id, folder.name, "folder")}
              onContextMenu={(event) => handleContextMenu(event, folderItem)}
              draggable={!isEditing}
              onDragStart={(e) =>
                handleDragStart(e, { type: "folder", id: folder.id, parentId: folder.parentId })
              }
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, folder.id, "folder")}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder.id)}
              className={cn(
                "group flex min-h-10 w-full items-center gap-1.5 rounded-lg text-[13px] transition-colors md:h-[28px] md:min-h-0",
                isSelected
                  ? "bg-white/[0.07] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                  : "text-foreground/70 hover:bg-white/[0.045] hover:text-foreground/88",
                isDragging && "opacity-50",
                isDropTarget && "bg-primary/12 ring-1 ring-white/10",
              )}
              style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: "8px" }}
            >
              <ChevronRight
                className={cn(
                  "w-3 h-3 shrink-0 transition-transform text-muted-foreground",
                  folder.isOpen && "rotate-90",
                )}
                strokeWidth={1.5}
              />
              <Folder
                className="w-[15px] h-[15px] shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="flex-1 min-w-0 h-[18px] flex items-center">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="m-0 h-[18px] w-full border-none bg-transparent p-0 text-[13px] caret-foreground outline-hidden selection:bg-primary/30"
                    style={{ caretColor: "currentColor" }}
                  />
                ) : (
                  <span className="text-left truncate select-none">{folder.name}</span>
                )}
              </span>
              <span className="ml-2 w-4 shrink-0 text-right text-[10px] text-muted-foreground/65 tabular-nums">
                {totalCount}
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem
              onClick={() => {
                if (!selectionHasMultiple) {
                  startRename(folder.id, folder.name, "folder");
                }
              }}
              className="gap-2"
              disabled={selectionHasMultiple}
            >
              <Pencil className="w-4 h-4" />
              Rename
            </ContextMenuItem>
            {renderMoveToSubmenu(selectionForAction)}
            <ContextMenuSeparator />
            {isFavorite(folder.id) ? (
              <ContextMenuItem onClick={() => removeFromFavorites(folder.id)} className="gap-2">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                Remove from Favorites
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onClick={() => addToFavorites(folder.id, "folder")}
                className="gap-2"
              >
                <Star className="w-4 h-4" />
                Add to Favorites
              </ContextMenuItem>
            )}
            {projects.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2">
                  <Briefcase className="w-4 h-4" />
                  Add to Project
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-40">
                  {projects.map((project) => (
                    <ContextMenuItem
                      key={project.id}
                      onClick={() => addToProject(project.id, folder.id, "folder")}
                      className="gap-2"
                    >
                      <span className={cn("w-2 h-2 rounded-full shrink-0", project.color)} />
                      {project.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            {customSections.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2">
                  <Folder className="w-4 h-4" />
                  Add to Section
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  {customSections.map((section) => (
                    <ContextMenuItem
                      key={section.id}
                      onClick={() => addToCustomSection(section.id, folder.id, "folder")}
                      className="gap-2"
                    >
                      {section.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => deleteSelection(selectionForAction)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              {selectionHasMultiple ? "Delete selected" : "Delete"}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {folder.isOpen && (
          <div>
            {childFolders.map((f) => renderFolder(f, depth + 1))}
            {childFiles.map((f) => renderFile(f, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file: NoteFile, depth: number = 0) => {
    const isEditing = editingId === file.id;
    const isDragging = dragItem?.id === file.id;
    const fileItem: SelectedItem = { id: file.id, type: "file", parentId: file.parentId };
    const selectionForAction = getSelectionForAction(fileItem);
    const selectionHasMultiple = selectionForAction.length > 1;
    const isSelected = isItemSelected(fileItem);

    return (
      <ContextMenu key={file.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={(event) =>
              handleItemClick(event, fileItem, () => {
                if (!isEditing) {
                  onFileSelect(file.id);
                }
              })
            }
            onContextMenu={(event) => handleContextMenu(event, fileItem)}
            onDoubleClick={(e) => handleDoubleClick(e, file.id, file.name, "file")}
            draggable={!isEditing}
            onDragStart={(e) =>
              handleDragStart(e, { type: "file", id: file.id, parentId: file.parentId })
            }
            onDragEnd={handleDragEnd}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 truncate rounded-lg text-left text-[13px] transition-colors md:h-[28px] md:min-h-0",
              isSelected || activeFileId === file.id
                ? "bg-white/[0.07] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                : "text-foreground/60 hover:bg-white/[0.045] hover:text-foreground/85",
              isDragging && "opacity-50",
            )}
            style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: "8px" }}
          >
            <FileText
              className="h-[14px] w-[14px] shrink-0 text-muted-foreground/70"
              strokeWidth={1.5}
            />
            <span className="flex-1 min-w-0 h-[18px] flex items-center">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="m-0 h-[18px] w-full border-none bg-transparent p-0 text-[13px] caret-foreground outline-hidden selection:bg-primary/30"
                  style={{ caretColor: "currentColor" }}
                />
              ) : (
                <span className="truncate select-none">{file.name}</span>
              )}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            onClick={() => {
              if (!selectionHasMultiple) {
                startRename(file.id, file.name, "file");
              }
            }}
            className="gap-2"
            disabled={selectionHasMultiple}
          >
            <Pencil className="w-4 h-4" />
            Rename
          </ContextMenuItem>
          {renderMoveToSubmenu(selectionForAction)}
          <ContextMenuSeparator />
          {isFavorite(file.id) ? (
            <ContextMenuItem onClick={() => removeFromFavorites(file.id)} className="gap-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              Remove from Favorites
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => addToFavorites(file.id, "file")} className="gap-2">
              <Star className="w-4 h-4" />
              Add to Favorites
            </ContextMenuItem>
          )}
          {projects.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <Briefcase className="w-4 h-4" />
                Add to Project
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-40">
                {projects.map((project) => (
                  <ContextMenuItem
                    key={project.id}
                    onClick={() => addToProject(project.id, file.id, "file")}
                    className="gap-2"
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", project.color)} />
                    {project.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {customSections.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <Folder className="w-4 h-4" />
                Add to Section
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                {customSections.map((section) => (
                  <ContextMenuItem
                    key={section.id}
                    onClick={() => addToCustomSection(section.id, file.id, "file")}
                    className="gap-2"
                  >
                    {section.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => deleteSelection(selectionForAction)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            {selectionHasMultiple ? "Delete selected" : "Delete"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const rootFolders = getFoldersInFolder(null);
  const rootFiles = getFilesInFolder(null);
  useEffect(() => {
    const validKeys = new Set<string>();
    files.forEach((file) => validKeys.add(`file:${file.id}`));
    folders.forEach((folder) => validKeys.add(`folder:${folder.id}`));
    setSelectedItems((prev) =>
      prev.filter((selection) => validKeys.has(`${selection.type}:${selection.id}`)),
    );
  }, [files, folders, setSelectedItems]);
  const isRootDropTarget = dropTarget?.id === null && dropTarget?.type === "root";

  return (
    <div
      className={cn("flex-1 overflow-y-auto px-2 py-1.5", isRootDropTarget && "bg-primary/6")}
      onDragOver={(e) => handleDragOver(e, null, "root")}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, null)}
    >
      {rootFolders.map((f) => renderFolder(f))}
      {rootFiles.map((f) => renderFile(f))}
    </div>
  );
}
