'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronRight, MoreHorizontal, EyeOff, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

type Props = {
  id: string;
  title: string;
  isCollapsed: boolean;
  isCustom?: boolean;
  itemCount?: number;
  onToggleCollapse: () => void;
  onToggleVisibility?: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function SidebarSection({
  id: _id,
  title,
  isCollapsed,
  isCustom = false,
  itemCount,
  onToggleCollapse,
  onToggleVisibility,
  onRename,
  onDelete,
  children,
  actions,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleRename = () => {
    if (onRename && editValue.trim() && editValue !== title) {
      onRename(editValue.trim());
    }
    setIsEditing(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Section header */}
      <div className="group flex min-h-11 items-center gap-1.5 px-3.5 transition-colors hover:bg-accent/50 md:h-8 md:min-h-0 md:gap-1 md:px-3">
        <button
          onClick={onToggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-4 md:w-4 md:rounded-none md:hover:bg-transparent"
        >
          <ChevronRight 
            className={cn(
              "w-3 h-3 transition-transform",
              !isCollapsed && "rotate-90"
            )} 
            strokeWidth={1.5} 
          />
        </button>

        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setEditValue(title);
                setIsEditing(false);
              }
            }}
            className="flex-1 bg-transparent text-xs font-medium text-muted-foreground outline-none border-b border-foreground/30"
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground md:text-xs md:tracking-wider">
            {title}
          </span>
        )}

        {itemCount !== undefined && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {itemCount}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {actions}
          
          {(isCustom || onToggleVisibility) && (
            <div className="relative">
              <button 
                ref={buttonRef}
                onClick={() => setShowMenu(!showMenu)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-5 md:w-5 md:rounded"
              >
                <MoreHorizontal className="w-3 h-3" strokeWidth={1.5} />
              </button>
              
              {showMenu && (
                <div 
                  ref={menuRef}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
                >
                  {onRename && (
                    <button 
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none w-full text-left hover:bg-accent hover:text-accent-foreground"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </button>
                  )}
                  {onToggleVisibility && (
                    <button 
                      onClick={() => {
                        onToggleVisibility();
                        setShowMenu(false);
                      }}
                      className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none w-full text-left hover:bg-accent hover:text-accent-foreground"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Hide section
                    </button>
                  )}
                  {isCustom && onDelete && (
                    <button 
                      onClick={() => {
                        onDelete();
                        setShowMenu(false);
                      }}
                      className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none w-full text-left text-red-400 hover:bg-accent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Section content */}
      {!isCollapsed && (
        <div className="pb-3 md:pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
