'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronRight, MoreHorizontal, EyeOff, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  id,
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
      <div className="group flex items-center h-8 px-3 gap-1 hover:bg-accent/50 transition-colors">
        <button
          onClick={onToggleCollapse}
          className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {title}
          </span>
        )}

        {itemCount !== undefined && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {itemCount}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
          
          {(isCustom || onToggleVisibility) && (
            <div className="relative">
              <button 
                ref={buttonRef}
                onClick={() => setShowMenu(!showMenu)}
                className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
        <div className="pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
