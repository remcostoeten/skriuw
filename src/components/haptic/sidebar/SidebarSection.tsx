'use client';

import { useState } from 'react';
import { ChevronRight, MoreHorizontal, Eye, EyeOff, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

  const handleRename = () => {
    if (onRename && editValue.trim() && editValue !== title) {
      onRename(editValue.trim());
    }
    setIsEditing(false);
  };

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <MoreHorizontal className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onRename && (
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-2" />
                    Rename
                  </DropdownMenuItem>
                )}
                {onToggleVisibility && (
                  <DropdownMenuItem onClick={onToggleVisibility}>
                    <EyeOff className="w-3.5 h-3.5 mr-2" />
                    Hide section
                  </DropdownMenuItem>
                )}
                {isCustom && onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-red-400">
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
