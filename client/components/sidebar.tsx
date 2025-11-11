import { Folder, FileText, ChevronRight, Search, Plus, FolderPlus, FilePlus, Edit, FolderOpen, Trash2 } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotes } from "@/features/notes/hooks/useNotes";
import { Item } from "@/features/notes/services/noteStorage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuTrigger,
} from "@ui";

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
    (targetId: string, e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedItemRef.current) return;

      const draggedItem = draggedItemRef.current;
      if (draggedItem.id === targetId) return;

      const targetItem = items.find((item) =>
        findItemInTree(item, targetId)
      );
      if (!targetItem || targetItem.type !== "folder") return;

      moveItem(draggedItem.id, targetId);
      // Keep expanded state - it's automatically persisted
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

  return (
    <div className="w-[210px] h-full bg-Skriuw-darker flex flex-col border-r border-Skriuw-border">
      <div className="h-10 border-b border-Skriuw-border flex items-center justify-center gap-2 px-3.5">
        <button
          onClick={() => handleCreateNote()}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
          title="Create new note"
        >
          <Plus className="w-[18px] h-[18px] text-Skriuw-icon" />
        </button>
        <button
          onClick={() => handleCreateFolder()}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
          title="Create new folder"
        >
          <FolderPlus className="w-[18px] h-[18px] text-Skriuw-icon" />
        </button>
      </div>

      <div className="relative py-2">
        <div className="px-2 mb-2">
          <div className="flex items-center gap-0.5 px-2 h-[39px] border border-Skriuw-border rounded-md bg-Skriuw-darker">
            <input
              type="text"
              className="flex-1 bg-transparent text-xs text-Skriuw-text placeholder:text-Skriuw-icon outline-hidden h-[30px]"
              placeholder="Search..."
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-4">
        <div className="flex flex-col gap-0.5">
          {items.map((item) => (
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
