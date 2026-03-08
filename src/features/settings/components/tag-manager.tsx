"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/shared/lib/utils";
import { useTagStore, TAG_COLORS, type Tag } from "@/store/tag-store";
import { Plus, MoreHorizontal, Trash2, Hash } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function TagManager() {
  const tags = useTagStore((s) => s.tags);
  const createTag = useTagStore((s) => s.create);
  const removeTag = useTagStore((s) => s.remove);

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0].value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingTag]);

  const handleAddTag = () => {
    const trimmed = newTagName.trim().toLowerCase();
    if (trimmed && !tags.find((t) => t.name === trimmed)) {
      createTag(trimmed, selectedColor);
    }
    setNewTagName("");
    setSelectedColor(TAG_COLORS[0].value);
    setIsAddingTag(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setIsAddingTag(false);
      setNewTagName("");
    }
  };

  // Sort by usage count
  const sortedTags = [...tags].sort((a, b) => b.usageCount - a.usageCount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Manage Tags</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{tags.length} tags created</p>
        </div>
        {!isAddingTag && (
          <button
            onClick={() => setIsAddingTag(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New tag
          </button>
        )}
      </div>

      {/* Add tag form */}
      {isAddingTag && (
        <div className="p-3 rounded-lg border border-border bg-card/50 space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tag name..."
              className="flex-1 text-sm bg-transparent outline-hidden placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => setSelectedColor(color.value)}
                  className={cn(
                    "w-6 h-6 rounded-md border-2 transition-all",
                    color.value.split(" ")[0], // Get bg class
                    selectedColor === color.value
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105",
                  )}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {newTagName && (
            <div className="pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Preview: </span>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ml-1",
                  selectedColor,
                )}
              >
                {newTagName.toLowerCase()}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setIsAddingTag(false);
                setNewTagName("");
              }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTag}
              disabled={!newTagName.trim()}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md transition-colors",
                newTagName.trim()
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              Create tag
            </button>
          </div>
        </div>
      )}

      {/* Tags list */}
      <div className="space-y-1">
        {sortedTags.map((tag) => (
          <TagRow key={tag.id} tag={tag} onDelete={() => removeTag(tag.id)} />
        ))}

        {tags.length === 0 && !isAddingTag && (
          <div className="py-8 text-center">
            <Hash className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No tags yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create your first tag to organize your notes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TagRow({ tag, onDelete }: { tag: Tag; onDelete: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  return (
    <div className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/30 transition-colors">
      {/* Tag badge */}
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border min-w-[60px]",
          tag.color,
        )}
      >
        {tag.name}
      </span>

      {/* Stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{tag.usageCount} uses</span>
          {tag.lastUsedAt && (
            <span className="truncate">
              Last used {formatDistanceToNow(new Date(tag.lastUsedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors",
            showMenu ? "bg-accent" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="p-1">
              <button
                onClick={() => {
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete tag
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
