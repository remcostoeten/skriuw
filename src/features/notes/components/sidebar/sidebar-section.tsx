"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, MoreHorizontal, EyeOff, Trash2, Pencil } from "lucide-react";
import { cn } from "@/shared/lib/utils";

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
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  return (
    <section className="mx-2 mb-1 last:mb-0">
      <div className="group relative flex min-h-9 items-center gap-1 rounded-lg px-2.5 transition-colors hover:bg-white/[0.025] md:h-7 md:min-h-0">
        <button
          onClick={onToggleCollapse}
          className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-white/[0.04] hover:text-foreground md:h-4 md:w-4"
        >
          <ChevronRight
            className={cn("h-3 w-3 transition-transform", !isCollapsed && "rotate-90")}
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
            className="flex-1 bg-transparent text-xs font-medium text-muted-foreground outline-none border-b border-foreground/30"
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate pr-10 text-[12px] font-medium text-muted-foreground/78 md:pr-16">
            {title}
          </span>
        )}

        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center justify-end">
          {itemCount !== undefined && (
            <span className="w-4 shrink-0 text-right text-[11px] text-muted-foreground/45 tabular-nums transition-opacity md:group-hover:opacity-0">
              {itemCount}
            </span>
          )}
        </div>

        <div className="absolute inset-y-0 right-2 flex items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {actions}

          {(isCustom || onToggleVisibility) && (
            <div className="relative">
              <button
                ref={buttonRef}
                onClick={() => setShowMenu(!showMenu)}
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-white/[0.04] hover:text-foreground md:h-4 md:w-4"
              >
                <MoreHorizontal className="w-3 h-3" strokeWidth={1.5} />
              </button>

              {showMenu && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded-xl border border-white/8 bg-popover/96 p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 backdrop-blur-xl"
                >
                  {onRename && (
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
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
                      className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
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
                      className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-400 outline-none hover:bg-accent"
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
      {!isCollapsed && <div className="pb-3 md:pb-2">{children}</div>}
    </section>
  );
}
