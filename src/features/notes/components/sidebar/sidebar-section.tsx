"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, MoreHorizontal, EyeOff, Trash2, Pencil } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Props = {
  id: string;
  title: string;
  isCollapsed: boolean;
  showHeader?: boolean;
  compactMode?: boolean;
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
  showHeader = true,
  compactMode = false,
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
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  return (
    <section className={cn("mx-2 last:mb-0", compactMode ? "mb-0.25" : "mb-0.5")}>
      {showHeader && (
        <div
          className={cn(
            "group relative flex items-center gap-1.5 px-2 transition-colors hover:bg-muted",
            compactMode ? "min-h-7" : "min-h-8 md:h-7 md:min-h-0",
          )}
        >
          <button
            onClick={onToggleCollapse}
            className={cn(
              "flex items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground",
              compactMode ? "h-3.5 w-3.5" : "h-4 w-4",
            )}
          >
            <ChevronRight
              className={cn("transition-transform", compactMode ? "h-2.5 w-2.5" : "h-3 w-3", !isCollapsed && "rotate-90")}
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
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setEditValue(title);
                  setIsEditing(false);
                }
              }}
              className={cn(
                "flex-1 bg-transparent font-medium uppercase tracking-wide text-muted-foreground outline-none border-b border-foreground/30",
                compactMode ? "text-[10px]" : "text-[11px]",
              )}
              autoFocus
            />
          ) : (
            <span
              className={cn(
                "flex-1 truncate pr-8 font-medium uppercase tracking-wide text-muted-foreground/60",
                compactMode ? "text-[10px]" : "text-[11px]",
              )}
            >
              {title}
            </span>
          )}

          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center justify-end">
            {itemCount !== undefined && (
              <span className="w-4 shrink-0 text-right text-[10px] text-muted-foreground/40 tabular-nums transition-opacity md:group-hover:opacity-0">
                {itemCount}
              </span>
            )}
          </div>

          <div className="absolute inset-y-0 right-1.5 flex items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            {actions}

            {(isCustom || onToggleVisibility) && (
              <div className="relative">
                <button
                  ref={buttonRef}
                  onClick={() => setShowMenu(!showMenu)}
                  className={cn(
                    "flex items-center justify-center border border-transparent text-muted-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground",
                    compactMode ? "h-4 w-4" : "h-5 w-5 md:h-4 md:w-4",
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" strokeWidth={1.5} />
                </button>

                {showMenu && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full z-50 mt-1 min-w-[8rem] overflow-hidden border border-border bg-popover p-1 text-popover-foreground animate-in fade-in-0"
                  >
                    {onRename && (
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="relative flex w-full cursor-default select-none items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:bg-muted hover:text-foreground"
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
                        className="relative flex w-full cursor-default select-none items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:bg-muted hover:text-foreground"
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
                        className="relative flex w-full cursor-default select-none items-center gap-2 px-2 py-1.5 text-left text-sm text-red-400 outline-none hover:bg-muted"
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
      )}

      {!isCollapsed && <div className={cn(showHeader ? "pb-2 pt-0.5" : "pb-1 pt-0")}>{children}</div>}
    </section>
  );
}
