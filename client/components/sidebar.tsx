import { useNotes } from "@/features/notes/hooks/useNotes";
import type { Folder as FolderType } from "@/features/notes/services/noteStorage";
import { Item } from "@/features/notes/services/noteStorage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@ui";
import { ChevronRight, Edit, FilePlus, Folder, FolderOpen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionBar } from "./action-bar";

const EXPANDED_FOLDERS_KEY = "Skriuw_expanded_folders";

type props = {
  activeNoteId?: string;
}

function FileTreeItem({
  item,
  level = 0,
  activeNoteId,
  expandedFolders,
  onToggleFolder,
  onNavigateNote,
  onRename,
  onDelete,
  onCreateNote,
  onCreateFolder,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: Item;
  level?: number;
  activeNoteId?: string;
  expandedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onNavigateNote: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onCreateFolder: (parentId?: string) => void;
  onDragStart: (item: Item, e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: string, e: React.DragEvent) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFolder = item.type === "folder";
  const isExpanded = expandedFolders.has(item.id);
  const isActive = !isFolder && activeNoteId === item.id;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleDoubleClick = () => {
    setIsRenaming(true);
  };

  const handleRenameComplete = () => {
    if (renameValue.trim()) {
      onRename(item.id, renameValue.trim());
    } else {
      setRenameValue(item.name);
    }
    setIsRenaming(false);
  };

  const handleFolderToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFolder(item.id);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isRenaming) {
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isFolder) {
          onToggleFolder(item.id);
        } else {
          onNavigateNote(item.id);
        }
      }

      if (isFolder) {
        if (e.key === "ArrowRight" && !isExpanded) {
          e.preventDefault();
          onToggleFolder(item.id);
        }
        if (e.key === "ArrowLeft" && isExpanded) {
          e.preventDefault();
          onToggleFolder(item.id);
        }
      }
    },
    [isRenaming, isFolder, onToggleFolder, item.id, onNavigateNote, isExpanded],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`relative flex items-center justify-between h-7 rounded-md transition-colors group ${isActive ? "bg-Skriuw-border" : "hover:bg-Skriuw-border/30"
            }`}
          style={{ marginLeft: `${level * 12}px` }}
          draggable
          onDragStart={(e) => onDragStart(item, e)}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(item.id, e)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="treeitem"
          aria-expanded={isFolder ? isExpanded : undefined}
        >
          <div className="flex items-center gap-0.5 flex-1 min-w-0 px-2">
            {isFolder ? (
              <>
                <ChevronRight
                  className={`w-4 h-4 text-Skriuw-icon shrink-0 transition-transform cursor-pointer ${isExpanded ? "rotate-90" : ""
                    }`}
                  onClick={handleFolderToggle}
                />
                <Folder
                  className="w-4 h-4 text-Skriuw-icon shrink-0 cursor-pointer"
                  onClick={handleFolderToggle}
                />
              </>
            ) : (
              <div className="w-4 h-4 shrink-0" />
            )}
            {isFolder && <div className="w-4 shrink-0" />}

            {isRenaming ? (
              <input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameComplete}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameComplete();
                  if (e.key === "Escape") {
                    setRenameValue(item.name);
                    setIsRenaming(false);
                  }
                }}
                className="flex-1 min-w-0 bg-Skriuw-border text-Skriuw-text text-xs px-1 py-0.5 rounded outline-hidden"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onClick={() => !isFolder && onNavigateNote(item.id)}
                onDoubleClick={handleDoubleClick}
                className={`text-xs truncate cursor-pointer flex-1 ${isActive ? "text-Skriuw-text font-medium" : "text-Skriuw-subtle"
                  }`}
                title={item.name}
              >
                {item.name}
              </span>
            )}
          </div>

          {isFolder && (
            <span className="text-xs text-Skriuw-faint px-2 shrink-0">
              {item.type === "folder" ? item.children.length : 0}
            </span>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onClick={() => onCreateNote(isFolder ? item.id : undefined)}
          className="h-7 text-xs font-base"
        >
          <FilePlus className="w-3.5 h-3.5 mr-2" />
          New note
          <ContextMenuShortcut>N</ContextMenuShortcut>
        </ContextMenuItem>
        {isFolder && (
          <ContextMenuItem
            onClick={() => onCreateFolder(item.id)}
            className="h-7 text-xs font-base"
          >
            <FolderOpen className="w-3.5 h-3.5 mr-2" />
            New folder
            <ContextMenuShortcut>F</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            setIsRenaming(true);
          }}
          className="h-7 text-xs font-base"
        >
          <Edit className="w-3.5 h-3.5 mr-2" />
          Rename
          <ContextMenuShortcut>R</ContextMenuShortcut>
        </ContextMenuItem>
        {isFolder && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="h-7 text-xs font-base">
              <FolderOpen className="w-3.5 h-3.5 mr-2" />
              Move folder to...
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {/* This would be populated with available folders */}
              <ContextMenuItem disabled className="text-xs">
                Root folder
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onDelete(item.id)}
          className="h-7 text-xs font-base text-destructive focus:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          Delete
          <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>

      {isFolder && isExpanded && (
        <div className="mt-0.5">
          {item.type === "folder" &&
            item.children.map((child) => (
              <FileTreeItem
                key={child.id}
                item={child}
                level={level + 1}
                activeNoteId={activeNoteId}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onNavigateNote={onNavigateNote}
                onRename={onRename}
                onDelete={onDelete}
                onCreateNote={onCreateNote}
                onCreateFolder={onCreateFolder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            ))}
        </div>
      )}
    </ContextMenu>
  );
}

export function Sidebar({ activeNoteId }: props) {
  const navigate = useNavigate();
  const {
    items,
    createNote,
    createFolder,
    renameItem,
    deleteItem,
    moveItem,
  } = useNotes();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const draggedItemRef = useRef<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Load expanded folders from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(EXPANDED_FOLDERS_KEY);
    if (stored) {
      try {
        const expanded = JSON.parse(stored);
        setExpandedFolders(new Set(expanded));
      } catch (error) {
        console.error("Error loading expanded folders:", error);
      }
    }
  }, []);

  // Save expanded folders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      EXPANDED_FOLDERS_KEY,
      JSON.stringify(Array.from(expandedFolders))
    );
  }, [expandedFolders]);

  const handleToggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleCreateNote = useCallback(async (parentId?: string) => {
    const newNote = await createNote("Untitled", parentId);
    // Keep expanded state
    navigate(`/note/${newNote.id}`);
  }, [createNote, navigate]);

  const handleCreateFolder = useCallback(async (parentId?: string) => {
    await createFolder("New Folder", parentId);
    // Keep expanded state - it's automatically persisted
  }, [createFolder]);

  const handleDragStart = useCallback((item: Item, e: React.DragEvent) => {
    draggedItemRef.current = item;
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback(
    async (targetId: string, e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedItemRef.current) return;

      const draggedItem = draggedItemRef.current;
      if (draggedItem.id === targetId) {
        draggedItemRef.current = null;
        return;
      }

      // Find target item
      const targetItem = items.find((item) =>
        findItemInTree(item, targetId)
      );
      if (!targetItem || targetItem.type !== "folder") {
        draggedItemRef.current = null;
        return;
      }

      // Prevent moving folder into itself or its descendants
      const isDescendant = (parentId: string, childId: string): boolean => {
        const parent = items.find((item) => findItemInTree(item, parentId));
        if (!parent || parent.type !== "folder") return false;

        const checkChildren = (folder: FolderType): boolean => {
          return folder.children.some((child) => {
            if (child.id === childId) return true;
            if (child.type === "folder") {
              return checkChildren(child as FolderType);
            }
            return false;
          });
        };

        return checkChildren(parent as FolderType);
      };

      if (draggedItem.type === "folder" && isDescendant(draggedItem.id, targetId)) {
        draggedItemRef.current = null;
        return; // Can't move folder into itself or its descendants
      }

      // Check if item is already in the target folder
      const isAlreadyInTarget = targetItem.type === "folder" &&
        targetItem.children.some((child) => child.id === draggedItem.id);
      if (isAlreadyInTarget) {
        draggedItemRef.current = null;
        return;
      }

      // Expand target folder so user can see the moved item
      setExpandedFolders((prev) => {
        const newSet = new Set(prev);
        newSet.add(targetId);
        return newSet;
      });

      // Perform the move
      await moveItem(draggedItem.id, targetId);
      draggedItemRef.current = null;
    },
    [items, moveItem]
  );

  const findItemInTree = (item: Item, targetId: string): boolean => {
    if (item.id === targetId) return true;
    if (item.type === "folder") {
      return item.children.some((child) => findItemInTree(child, targetId));
    }
    return false;
  };

  // Helper function to collect all folder IDs recursively
  const collectAllFolderIds = useCallback((items: Item[]): string[] => {
    const folderIds: string[] = [];
    const traverse = (item: Item) => {
      if (item.type === "folder") {
        folderIds.push(item.id);
        item.children.forEach(traverse);
      }
    };
    items.forEach(traverse);
    return folderIds;
  }, []);

  // Check if all folders are expanded
  const areAllFoldersExpanded = useMemo(() => {
    const allFolderIds = collectAllFolderIds(items);
    return allFolderIds.length > 0 && allFolderIds.every((id) => expandedFolders.has(id));
  }, [items, expandedFolders, collectAllFolderIds]);

  const handleExpandCollapseAll = useCallback(() => {
    const allFolderIds = collectAllFolderIds(items);
    if (areAllFoldersExpanded) {
      // Collapse all
      setExpandedFolders(new Set());
    } else {
      // Expand all
      setExpandedFolders(new Set(allFolderIds));
    }
  }, [items, areAllFoldersExpanded, collectAllFolderIds]);

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
  }, []);

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
  }, []);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }
    // TODO: Implement proper search filtering
    return items;
  }, [items, searchQuery]);

  return (
    <div className="w-[210px] h-full bg-Skriuw-darker flex flex-col border-r border-Skriuw-border">
      <ActionBar
        onCreateNote={() => handleCreateNote()}
        onCreateFolder={() => handleCreateFolder()}
        searchConfig={{
          query: searchQuery,
          setQuery: setSearchQuery,
          close: handleSearchClose,
          toggle: handleSearchToggle,
          isOpen: isSearchOpen,
        }}
        expandConfig={{
          isExpanded: areAllFoldersExpanded,
          onToggle: handleExpandCollapseAll,
        }}
      />
      <div className="flex-1 overflow-y-auto px-1 pb-4">
        <div className="flex flex-col gap-0.5" role="tree" aria-label="Notes">
          {filteredItems.map((item) => (
            <FileTreeItem
              key={item.id}
              item={item}
              activeNoteId={activeNoteId}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onNavigateNote={(id) => navigate(`/note/${id}`)}
              onRename={renameItem}
              onDelete={deleteItem}
              onCreateNote={handleCreateNote}
              onCreateFolder={handleCreateFolder}
              onDragStart={handleDragStart}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
