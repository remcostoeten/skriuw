import { Edit, FilePlus, FolderOpen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useMediaQuery, MOBILE_BREAKPOINT } from "@/shared/utilities/use-media-query";

import { useNotes } from "@/features/notes/hooks/useNotes";
import { blocksToText } from "@/features/notes/utils/blocks-to-text";
import { SeedImportDialog } from "@/features/seed-importer/components/seed-import-dialog";
import { useSeedDiscovery } from "@/features/seed-importer/hooks/use-seed-discovery";
import { useSettings } from "@/features/settings";
import { useShortcut } from "@/features/shortcuts";
import { useContextMenuState } from "@/features/shortcuts/context-menu-context";
import { useUIStore } from "@/stores/ui-store";

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
  IconButton,
} from "ui";

import { ActionBar } from "../action-bar";
import { cn } from "@/shared/utilities";

import { useSidebarContentType } from "./use-sidebar-content-type";
import { NotesIcon } from "@/shared/ui/icons";

import type { SidebarContentType } from "./types";
import type { Folder as FolderType, Item } from "@/features/notes/types";
import type { Block } from "@blocknote/core";

const EXPANDED_FOLDERS_KEY = "Skriuw_expanded_folders";

// Folder closed SVG
const FolderClosedIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" width="1em" height="1em" viewBox="0 0 20 20">
    <path fillRule="evenodd" clipRule="evenodd" d="M7.59655 2.20712C7.10136 1.9989 6.56115 1.99943 5.9023 2.00007L4.40479 2.00015C3.57853 2.00013 2.88271 2.0001 2.32874 2.07318C1.74135 2.15066 1.20072 2.32242 0.764844 2.75008C0.328798 3.1779 0.153514 3.70882 0.0744639 4.28569C-4.74114e-05 4.82945 -2.52828e-05 5.51233 9.81743e-07 6.32281V11.8675C-1.65965e-05 13.1029 -3.08677e-05 14.1058 0.108284 14.8963C0.221156 15.72 0.464085 16.4241 1.03541 16.9846C1.60656 17.545 2.32369 17.7831 3.16265 17.8938C3.96804 18 4.99002 18 6.2493 18H13.7507C15.01 18 16.032 18 16.8374 17.8938C17.6763 17.7831 18.3934 17.545 18.9646 16.9846C19.5359 16.4241 19.7788 15.72 19.8917 14.8963C20 14.1058 20 13.1029 20 11.8676V9.94525C20 8.70992 20 7.70702 19.8917 6.91657C19.7788 6.09287 19.5359 5.38878 18.9646 4.82823C18.3934 4.26785 17.6763 4.02972 16.8374 3.91905C16.0319 3.81281 15.0099 3.81283 13.7506 3.81285L9.91202 3.81285C9.70527 3.81285 9.59336 3.81232 9.51046 3.80596C9.47861 3.80352 9.461 3.80081 9.45249 3.79919C9.44546 3.79427 9.43137 3.78367 9.40771 3.76281C9.34589 3.70835 9.26838 3.62926 9.12578 3.48235L8.91813 3.26831C8.46421 2.79975 8.09187 2.4154 7.59655 2.20712ZM2.53158 3.55817C2.97217 3.50005 3.5649 3.49846 4.45741 3.49846H5.77707C6.19724 3.49846 6.45952 3.50169 6.63994 3.51453C6.81907 3.52729 6.91262 3.54925 6.99675 3.58462C7.08084 3.61998 7.16148 3.67125 7.29433 3.78964C7.42818 3.90891 7.6114 4.09298 7.90119 4.39152L8.02253 4.51653L8.07907 4.57502C8.29018 4.79381 8.5293 5.04163 8.85233 5.17747C9.17524 5.31324 9.52282 5.31222 9.82983 5.31132L9.91202 5.31115H13.6951C15.023 5.31115 15.9424 5.31274 16.6345 5.40404C17.3048 5.49246 17.6468 5.6525 17.8873 5.88854C18.1277 6.12441 18.2906 6.45944 18.3807 7.11653C18.4737 7.79534 18.4753 8.69706 18.4753 10.0001V11.8128C18.4753 13.1158 18.4737 14.0175 18.3807 14.6963C18.2906 15.3534 18.1277 15.6884 17.8873 15.9243C17.6468 16.1603 17.3048 16.3204 16.6345 16.4088C15.9424 16.5001 15.023 16.5017 13.6951 16.5017H6.30494C4.97698 16.5017 4.05764 16.5001 3.36549 16.4088C2.69519 16.3204 2.35324 16.1603 2.11266 15.9243C1.87226 15.6884 1.70936 15.3534 1.61932 14.6963C1.5263 14.0175 1.52468 13.1158 1.52468 11.8128V6.37469C1.52468 5.49891 1.5263 4.91765 1.5855 4.48566C1.64172 4.07541 1.73696 3.91355 1.8421 3.81039C1.94741 3.70706 2.11288 3.6134 2.53158 3.55817Z" fill="currentColor" />
  </svg>
);

// Folder open SVG
const FolderOpenIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" width="1em" height="1em" viewBox="0 0 20 20">
    <path fillRule="evenodd" clipRule="evenodd" d="M6.22891 18C4.9566 18 3.93097 18 3.1244 17.8935C2.28697 17.7828 1.58187 17.5461 1.02187 16.9958C0.461866 16.4455 0.221 15.7526 0.108411 14.9296C-3.31178e-05 14.137 -1.7645e-05 13.1291 1.54211e-06 11.8788L1.04302e-06 6.29541C-2.62958e-05 5.47395 -4.90919e-05 4.78896 0.0743487 4.24516C0.152876 3.67118 0.325617 3.15297 0.74937 2.73655C1.17312 2.32012 1.70045 2.15037 2.28453 2.0732C2.83789 2.00009 3.53494 2.00011 4.37086 2.00013L5.92613 2.00007C6.57085 1.99946 7.08108 1.99899 7.55104 2.18869C8.021 2.37838 8.38357 2.73117 8.84171 3.17694L9.0622 3.39116C9.20356 3.52844 9.28285 3.60481 9.3465 3.65795C9.37486 3.68162 9.3916 3.69332 9.4005 3.699C9.40472 3.70169 9.40712 3.70298 9.40801 3.70345L9.40913 3.70399L9.41032 3.70438C9.41129 3.70466 9.41391 3.7054 9.41884 3.7064C9.42923 3.70851 9.44951 3.71175 9.48661 3.7145C9.56989 3.72068 9.68092 3.72113 9.87965 3.72113L13.0938 3.72111C13.6755 3.72097 14.072 3.72087 14.4167 3.78961C15.79 4.06347 16.8634 5.11825 17.1421 6.46785C17.2021 6.75842 17.2105 7.08647 17.2116 7.53472C17.4034 7.54922 17.5834 7.56801 17.7514 7.59237C18.5137 7.70289 19.1943 7.94917 19.633 8.57761C20.0718 9.20605 20.0607 9.91867 19.8913 10.6574C19.7278 11.3702 19.3805 12.2551 18.9553 13.3383L18.6619 14.0858C18.3405 14.9047 18.0787 15.5717 17.8049 16.0905C17.5191 16.6321 17.1912 17.0712 16.7057 17.3985C16.2202 17.7258 15.6854 17.8685 15.0682 17.9356C14.4771 18 13.7497 18 12.8565 18L6.22891 18ZM5.81464 3.37155C6.62543 3.37155 6.83809 3.3835 7.0208 3.45726C7.20351 3.53101 7.36332 3.6694 7.94002 4.22946L8.08126 4.36662L8.13369 4.41774C8.34687 4.62596 8.57694 4.85067 8.8789 4.97256C9.18086 5.09444 9.50523 5.09353 9.8058 5.09268L9.87965 5.09254H13.0114C13.7067 5.09254 13.9504 5.096 14.1392 5.13363C14.9632 5.29795 15.6072 5.93081 15.7744 6.74058C15.805 6.88885 15.8134 7.07165 15.8155 7.48813C15.5174 7.48575 15.2019 7.48576 14.8692 7.48577H7.25505C6.70129 7.48575 6.23171 7.48573 5.84482 7.52626C5.43305 7.56939 5.05328 7.66313 4.69832 7.88867C4.34336 8.11422 4.10052 8.41609 3.89152 8.76739C3.69515 9.09748 3.50247 9.51829 3.27524 10.0146L2.3991 11.9279C2.00422 12.7902 1.66601 13.5287 1.435 14.1586C1.39636 13.5526 1.39555 12.7992 1.39555 11.8286V6.34295C1.39555 5.46158 1.39703 4.86953 1.45745 4.4279C1.51517 4.006 1.61493 3.82543 1.73617 3.70628C1.85741 3.58714 2.04116 3.48911 2.47048 3.43238C2.91988 3.37301 3.52235 3.37155 4.41923 3.37155H5.81464ZM14.8113 8.85718C16.0648 8.85718 16.9261 8.85897 17.5477 8.9491C18.1547 9.0371 18.3667 9.18785 18.4823 9.35347C18.5979 9.5191 18.6648 9.76768 18.5299 10.3559C18.3918 10.9583 18.0835 11.7486 17.6324 12.8979L17.3741 13.556C17.035 14.4199 16.8002 15.0155 16.5661 15.4591C16.34 15.8875 16.1443 16.1139 15.9162 16.2677C15.688 16.4215 15.4027 16.5194 14.9146 16.5726C14.4093 16.6276 13.7592 16.6285 12.8169 16.6285H6.4533C5.13332 16.6285 4.22286 16.6267 3.56903 16.5315C2.92754 16.438 2.71197 16.278 2.59893 16.1062C2.48589 15.9344 2.42586 15.6756 2.6024 15.0624C2.78233 14.4373 3.15427 13.6207 3.69594 12.4378L4.53327 10.6092C4.77905 10.0725 4.94187 9.71911 5.09629 9.45955C5.24227 9.21416 5.34986 9.1078 5.45606 9.04032C5.56226 8.97284 5.70511 8.92008 5.99273 8.88995C6.29696 8.85808 6.6917 8.85718 7.29063 8.85718H14.8113Z" fill="currentColor" />
  </svg>
);

type RulerProps = {
  enabled?: boolean;
  color?: string;
  style?: "solid" | "dashed";
  opacity?: number;
};

type props = {
  activeNoteId?: string;
  contentType?: SidebarContentType;
  customContent?: React.ReactNode;
  ruler?: RulerProps;
}

function FileTreeItem({
  item,
  level = 0,
  activeNoteId,
  expandedFolders,
  selectedFolderId,
  onToggleFolder,
  onNavigateNote,
  onRename,
  onDelete,
  onCreateNote,
  onCreateFolder,
  onDragStart,
  onDragOver,
  onDrop,
  onSelectFolder,
  onContextMenuOpenChange,
  ruler,
}: {
  item: Item;
  level?: number;
  activeNoteId?: string;
  expandedFolders: Set<string>;
  selectedFolderId: string | null;
  onToggleFolder: (id: string) => void;
  onNavigateNote: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onCreateFolder: (parentId?: string) => void;
  onDragStart: (item: Item, e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: string, e: React.DragEvent) => void;
  onSelectFolder: (id: string | null) => void;
  onContextMenuOpenChange?: (open: boolean, itemId: string, onDelete: (id: string) => void) => void;
  ruler?: RulerProps;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFolder = item.type === "folder";
  const isExpanded = expandedFolders.has(item.id);
  const isActive = !isFolder && activeNoteId === item.id;
  const isSelected = isFolder && selectedFolderId === item.id;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      // Small delay to ensure the input is fully rendered and visible
      const focusTimeout = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
          // Ensure the input is scrolled into view
          inputRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 10);

      return () => clearTimeout(focusTimeout);
    }
  }, [isRenaming]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Clear any pending single click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setIsRenaming(true);
  }, []);

  const handleNameClick = (e: React.MouseEvent) => {
    if (isRenaming) return;
    
    // Stop propagation so clicking name doesn't trigger folder toggle
    e.stopPropagation();

    // Use a small delay to distinguish between single and double click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = setTimeout(() => {
      if (isFolder) {
        // Don't toggle folder when clicking name - only select
        onSelectFolder(item.id);
      } else {
        onNavigateNote(item.id);
        onSelectFolder(null); // Clear folder selection when clicking a note
      }
      clickTimeoutRef.current = null;
    }, 200);
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't handle if renaming
    if (isRenaming) return;
    
    // Clear any pending single click timeout to prevent it from firing
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    const clickedElement = e.target as HTMLElement;
    
    // Don't toggle if clicking on the rename input
    if (clickedElement.tagName === 'INPUT') {
      return;
    }
    
    // Don't handle if clicking on the name span (it has its own handler with double-click detection)
    if (clickedElement.closest('[data-item-name]')) {
      return;
    }
    
    // Don't toggle if clicking on the icon (it has its own handler)
    if (clickedElement.closest('[data-folder-icon]') || clickedElement.closest('svg[data-folder-icon]')) {
      return;
    }

    if (isFolder) {
      // Toggle folder when clicking on the button
      onToggleFolder(item.id);
      onSelectFolder(item.id);
    } else {
      // Navigate to note
      onNavigateNote(item.id);
      onSelectFolder(null);
    }
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
    onSelectFolder(item.id);
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

  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    if (onContextMenuOpenChange) {
      onContextMenuOpenChange(open, item.id, onDelete);
    }
  }, [item.id, onDelete, onContextMenuOpenChange]);

  const childCount = isFolder && item.type === "folder" ? item.children.length : 0;

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div className="w-full">
          <div className="w-full h-full">
            <button
              type="button"
              onClick={handleRowClick}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick();
              }}
              className={`font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground hover:fill-foreground transition-all flex items-center justify-between touch-manipulation ${
                isActive
                  ? "bg-accent text-foreground"
                  : "text-secondary-foreground/80 hover:text-foreground"
              }`}
              style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
              draggable
              onDragStart={(e) => onDragStart(item, e)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(item.id, e)}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              role="treeitem"
              aria-expanded={isFolder ? isExpanded : undefined}
            >
              <div className="flex items-center w-[calc(100%-20px)] gap-2 min-w-0">
                {isFolder ? (
                  <>
                    <div
                      data-folder-icon
                      onClick={handleFolderToggle}
                      className="shrink-0 cursor-pointer"
                    >
                      {isExpanded ? <FolderOpenIcon /> : <FolderClosedIcon />}
                    </div>
                  </>
                ) : null}
                
                {isRenaming ? (
                  <input
                    ref={(el) => {
                      inputRef.current = el;
                      if (el) {
                        setTimeout(() => {
                          el.focus();
                          el.select();
                        }, 0);
                      }
                    }}
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
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-accent text-foreground text-xs px-1 py-0.5 rounded outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    onClick={handleNameClick}
                    className="text-xs truncate outline-none cursor-pointer"
                    title={item.name}
                    data-item-name
                  >
                    {item.name}
                  </span>
                )}
              </div>

              {isFolder && (
                <span className="text-xs text-foreground/40">{childCount}</span>
              )}
            </button>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44 max-w-[90vw]">
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onCreateNote(isFolder ? item.id : undefined);
          }}
          className="h-8 text-xs font-base min-h-[44px]"
        >
          <FilePlus className="w-4 h-4 mr-3 flex-shrink-0" />
          New note
          <ContextMenuShortcut>N</ContextMenuShortcut>
        </ContextMenuItem>
        {isFolder && (
          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder(item.id);
            }}
            className="h-8 text-xs font-base min-h-[44px]"
          >
            <FolderOpen className="w-4 h-4 mr-3 flex-shrink-0" />
            New folder
            <ContextMenuShortcut>F</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            setIsRenaming(true);
          }}
          className="h-8 text-xs font-base min-h-[44px]"
        >
          <Edit className="w-4 h-4 mr-3 flex-shrink-0" />
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
          className="h-8 text-xs font-base text-destructive focus:text-destructive min-h-[44px]"
        >
          <Trash2 className="w-4 h-4 mr-3 flex-shrink-0" />
          Delete
          <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>

      {isFolder && isExpanded && item.type === "folder" && (
        <div className="space-y-1.5 pt-1.5 relative">
          {ruler?.enabled && (
            <div
              className="absolute top-0 bottom-0"
              style={{
                left: `calc(${(0.75 + level * 0.75)}rem + 9px - 0.5px)`,
                borderLeft: `1px ${ruler.style === "dashed" ? "dashed" : "solid"}`,
                borderColor: ruler.color || "currentColor",
                opacity: ruler.opacity || 0.25,
                zIndex: 1,
              }}
            />
          )}
          {item.children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              activeNoteId={activeNoteId}
              expandedFolders={expandedFolders}
              selectedFolderId={selectedFolderId}
              onToggleFolder={onToggleFolder}
              onNavigateNote={onNavigateNote}
              onRename={onRename}
              onDelete={onDelete}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onSelectFolder={onSelectFolder}
              onContextMenuOpenChange={onContextMenuOpenChange}
              ruler={ruler}
            />
          ))}
        </div>
      )}
    </ContextMenu>
  );
}

export function Sidebar({ activeNoteId, contentType, customContent, ruler }: props) {
  const navigate = useNavigate();
  const detectedContentType = useSidebarContentType();
  const finalContentType = contentType || detectedContentType;
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  // Access sidebar state
  const isDesktopSidebarOpen = useUIStore((state) => state.isDesktopSidebarOpen);

  // All hooks must be called before any conditional returns
  const {
    items,
    createNote,
    createFolder,
    renameItem,
    deleteItem,
    moveItem,
  } = useNotes();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const draggedItemRef = useRef<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { contextMenuState, setContextMenuState } = useContextMenuState();
  const { getSetting } = useSettings();
  const searchInContent = getSetting('searchInContent') ?? false;
  const [showSeedImport, setShowSeedImport] = useState(false);
  const { seeds } = useSeedDiscovery();

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
        // If folder is already expanded, collapse it
        newSet.delete(id);
      } else {
        // If folder is collapsed, expand it smartly to show first file
        const findFirstNotePath = (items: Item[], targetId: string): string[] | null => {
          // Find the target folder first
          const findFolder = (itemList: Item[], folderId: string): Item | null => {
            for (const item of itemList) {
              if (item.id === folderId && item.type === 'folder') {
                return item;
              }
              if (item.type === 'folder') {
                const found = findFolder(item.children, folderId);
                if (found) return found;
              }
            }
            return null;
          };

          const targetFolder = findFolder(items, targetId);
          if (!targetFolder) return null;

          // Find the first note in this folder's hierarchy
          const findFirstNoteInHierarchy = (folder: Item): string[] | null => {
            if (folder.type !== 'folder') return null;

            // Check direct children for notes first
            for (const child of folder.children) {
              if (child.type === 'note') {
                return [folder.id]; // Path stops here - we found a note
              }
            }

            // If no direct notes, check subfolders recursively
            for (const child of folder.children) {
              if (child.type === 'folder') {
                const subPath = findFirstNoteInHierarchy(child);
                if (subPath) {
                  return [folder.id, ...subPath];
                }
              }
            }

            return null; // No notes found in this folder
          };

          return findFirstNoteInHierarchy(targetFolder);
        };

        // Find the path to the first note
        const firstNotePath = findFirstNotePath(items, id);

        if (firstNotePath) {
          // Expand all folders in the path to the first note
          firstNotePath.forEach(folderId => {
            newSet.add(folderId);
          });
        } else {
          // If no notes found, just expand this folder
          newSet.add(id);
        }
      }

      return newSet;
    });
  }, [items]);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      const findActualItem = (itemList: Item[], id: string): Item | undefined => {
        for (const item of itemList) {
          if (item.id === id) return item;
          if (item.type === "folder") {
            const found = findActualItem(item.children, id);
            if (found) return found;
          }
        }
        return undefined;
      };

      const folderExists = findActualItem(items, selectedFolderId);
      if (!folderExists) {
        setSelectedFolderId(null);
      }
    }
  }, [items, selectedFolderId]);

  const handleCreateNote = useCallback(async (parentId?: string) => {
    const targetFolderId = parentId !== undefined ? parentId : selectedFolderId;
    
    // Expand parent folder if creating inside a folder
    if (targetFolderId) {
      setExpandedFolders((prev) => {
        const newSet = new Set(prev);
        newSet.add(targetFolderId);
        return newSet;
      });
    }
    
    const newNote = await createNote("Untitled", targetFolderId || undefined);
    navigate(`/note/${newNote.id}?focus=true`);
    setSelectedFolderId(null);
  }, [createNote, navigate, selectedFolderId]);

  const handleCreateFolder = useCallback(async (parentId?: string) => {
    const targetFolderId = parentId !== undefined ? parentId : selectedFolderId;

    if (targetFolderId) {
      setExpandedFolders((prev) => {
        const newSet = new Set(prev);
        newSet.add(targetFolderId);
        return newSet;
      });
    }

    await createFolder("New Folder", targetFolderId || undefined);
  }, [createFolder, selectedFolderId]);

  const handleImportSeeds = useCallback(() => {
    setShowSeedImport(true);
  }, [setShowSeedImport]);

  const handleSeedImportComplete = useCallback(() => {
    setShowSeedImport(false);
    // The useNotes hook should automatically refresh when items change
  }, [setShowSeedImport]);

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

      const findActualItem = (itemList: Item[], id: string): Item | undefined => {
        for (const item of itemList) {
          if (item.id === id) return item;
          if (item.type === "folder") {
            const found = findActualItem(item.children, id);
            if (found) return found;
          }
        }
        return undefined;
      };

      const targetItem = findActualItem(items, targetId);
      if (!targetItem || targetItem.type !== "folder") {
        draggedItemRef.current = null;
        return;
      }

      const isDescendant = (parentId: string, childId: string): boolean => {
        const parent = findActualItem(items, parentId);
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
        return;
      }

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

      const success = await moveItem(draggedItem.id, targetId);
      draggedItemRef.current = null;

      if (!success) {
        console.error('Failed to move item');
      }
    },
    [items, moveItem]
  );


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

  const areAllFoldersExpanded = useMemo(() => {
    const allFolderIds = collectAllFolderIds(items);
    return allFolderIds.length > 0 && allFolderIds.every((id) => expandedFolders.has(id));
  }, [items, expandedFolders, collectAllFolderIds]);

  const handleExpandCollapseAll = useCallback(() => {
    const allFolderIds = collectAllFolderIds(items);
    if (areAllFoldersExpanded) {
      setExpandedFolders(new Set());
    } else {
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

  const handleContextMenuOpenChange = useCallback((open: boolean, itemId: string, onDelete: (id: string) => void) => {
    if (open) {
      setContextMenuState({
        itemId,
        onDelete,
      });
    } else {
      setContextMenuState({
        itemId: null,
        onDelete: null,
      });
    }
  }, [setContextMenuState]);

  useShortcut("delete-item", useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    if (contextMenuState.itemId && contextMenuState.onDelete) {
      contextMenuState.onDelete(contextMenuState.itemId);
      // Clear the context menu state after deletion
      setContextMenuState({
        itemId: null,
        onDelete: null,
      });
    }
  }, [contextMenuState, setContextMenuState]));
    
  const sortItems = useCallback((items: Item[]): Item[] => {
    const sorted = [...items].sort((a, b) => {
      if (a.type === 'folder' && b.type === 'note') return -1;
      if (a.type === 'note' && b.type === 'folder') return 1;
      // If same type, maintain original order (or sort by name)
      return 0;
    }).map(item => {
      // Recursively sort children if it's a folder
      if (item.type === 'folder') {
        return {
          ...item,
          children: [...sortItems(item.children)] // Ensure new array reference
        };
      }
      return { ...item }; // Create new object reference for notes too
    });
    return sorted;
  }, []);

  // Fi                                                                       lter and sort items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortItems(items);
    }

    const query = searchQuery.toLowerCase().trim();
    
    // Recursive function to filter items
    const filterItems = (itemList: Item[]): Item[] => {
      const filtered: Item[] = [];
      
      for (const item of itemList) {
        // Check if item name matches
        const nameMatches = item.name.toLowerCase().includes(query);
        
        // Check if content matches (only for notes and if searchInContent is enabled)
        let contentMatches = false;
        if (searchInContent && item.type === 'note' && 'content' in item) {
          const note = item as { content?: Block[] };
          if (note.content && Array.isArray(note.content)) {
            try {
              const contentText = blocksToText(note.content);
              contentMatches = contentText.toLowerCase().includes(query);
            } catch (error) {
              // If content extraction fails, just search by name
              console.warn('Failed to extract text from note content:', error);
            }
          }
        }
        
        // If this item matches, include it
        if (nameMatches || contentMatches) {
          // If it's a folder, recursively filter its children
          if (item.type === 'folder') {
            const filteredChildren = filterItems(item.children);
            filtered.push({
              ...item,
              children: filteredChildren,
            } as Item);
          } else {
            filtered.push(item);
          }
        } else if (item.type === 'folder') {
          // If folder doesn't match, check if any children match
          const filteredChildren = filterItems(item.children);
          if (filteredChildren.length > 0) {
            // Include folder if it has matching children
            filtered.push({
              ...item,
              children: filteredChildren,
            } as Item);
          }
        }
      }
      
      return filtered;
    };
    
    return sortItems(filterItems(items));
  }, [items, searchQuery, sortItems, searchInContent]);

  // Early returns after all hooks
  if (finalContentType === 'custom' && customContent) {
    return <>{customContent}</>;
  }

  if (finalContentType === 'table-of-contents') {
    return customContent || null;
  }

  // Check if we're in collapsed state (should show icons instead of full sidebar)
  const isCollapsed = !isDesktopSidebarOpen;

  // If collapsed, render a minimal icon-only sidebar
  if (isCollapsed) {
    return (
      <div className="w-12 h-full bg-sidebar-background flex flex-col border-r border-sidebar-border">
        <div className="flex flex-col items-center gap-2 pt-1.5 flex-1">
          {/* Notes icon - always visible */}
          <IconButton
            icon={<NotesIcon />}
            tooltip="Notes"
            active={true}
            variant="sidebar"
            onClick={() => navigate("/")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-full bg-sidebar-background flex flex-col border-r border-sidebar-border bg-background",
      // Responsive width for sidebar
      isMobile ? "w-[280px] max-w-[85vw]" : "w-[210px]"
    )}>
      <ActionBar
        onCreateNote={() => handleCreateNote()}
        onCreateFolder={() => handleCreateFolder()}
        onImportSeeds={handleImportSeeds}
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
      <div
        className="flex-1 overflow-y-auto px-2 pt-2 pb-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedFolderId(null);
          }
        }}
      >
        <div
          className="flex flex-col items-start gap-1 w-full"
          role="tree"
          aria-label="Notes"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedFolderId(null);
            }
          }}
        >
          {filteredItems.map((item) => (
            <FileTreeItem
              key={item.id}
              item={item}
              activeNoteId={activeNoteId}
              expandedFolders={expandedFolders}
              selectedFolderId={selectedFolderId}
              onToggleFolder={handleToggleFolder}
              onNavigateNote={(id) => navigate(`/note/${id}`)}
              onRename={renameItem}
              onDelete={deleteItem}
              onCreateNote={handleCreateNote}
              onCreateFolder={handleCreateFolder}
              onDragStart={handleDragStart}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onSelectFolder={handleSelectFolder}
              onContextMenuOpenChange={handleContextMenuOpenChange}
              ruler={ruler}
            />
          ))}
        </div>
      </div>

      {/* Seed Import Dialog */}
      <SeedImportDialog
        open={showSeedImport}
        onOpenChange={setShowSeedImport}
        seeds={seeds}
        onImport={handleSeedImportComplete}
      />
    </div>
  );
}
