"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/shared/lib/utils";
import { TAG_COLORS } from "@/features/journal/types";
import type { JournalTag as Tag } from "@/types/journal";
import { Plus, MoreHorizontal, Trash2, Hash } from "lucide-react";
import type {
  CssColorValue,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import {
  useCreateJournalTag,
  useDeleteJournalTag,
  useJournalTags,
} from "@/features/journal/hooks/use-journal-queries";

export function TagManager() {
  const { data: tags = [] } = useJournalTags();
  const createTag = useCreateJournalTag();
  const removeTag = useDeleteJournalTag();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingTag]);

  const handleAddTag = () => {
    const trimmed = newTagName.trim().toLowerCase();
    if (trimmed && !tags.find((t) => t.name === trimmed)) {
      void createTag.mutateAsync({
        name: trimmed as TagName,
        color: selectedColor as CssColorValue,
      });
    }
    setNewTagName("");
    setSelectedColor(TAG_COLORS[0]);
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
            className="flex items-center gap-1.5 border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
            New tag
          </button>
        )}
      </div>

      {/* Add tag form */}
      {isAddingTag && (
        <div className="space-y-3 border border-border bg-card p-3">
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
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "h-6 w-6 border transition-colors",
                    selectedColor === color
                      ? "border-foreground"
                      : "border-transparent hover:border-border",
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {newTagName && (
            <div className="border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">Preview: </span>
              <span
                className="ml-1 inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: `${selectedColor}55`,
                  backgroundColor: `${selectedColor}1f`,
                  color: selectedColor,
                }}
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
                "border px-3 py-1.5 text-xs transition-colors",
                newTagName.trim()
                  ? "border-border bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed border-border bg-muted text-muted-foreground",
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
          <TagRow
            key={tag.id}
            tag={tag}
            onDelete={() => void removeTag.mutateAsync(tag.id as TagId)}
          />
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
    <div className="group -mx-2 flex items-center gap-3 border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted">
      {/* Tag badge */}
      <span
        className="inline-flex min-w-[60px] items-center border px-2 py-0.5 text-xs font-medium"
        style={{
          borderColor: `${tag.color}55`,
          backgroundColor: `${tag.color}1f`,
          color: tag.color,
        }}
      >
        {tag.name}
      </span>

      {/* Stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{tag.usageCount} uses</span>
        </div>
      </div>

      {/* Actions */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={cn(
            "flex h-6 w-6 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground",
            showMenu ? "border-border bg-muted" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden border border-border bg-card">
            <div className="p-1">
              <button
                onClick={() => {
                  onDelete();
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2 border border-transparent px-2 py-1.5 text-xs text-red-400 transition-colors hover:border-border hover:bg-red-500/10"
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
